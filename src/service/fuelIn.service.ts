import { FilterQuery, UpdateQuery } from "mongoose";
import fuelInModel, { fuelInDocument } from "../model/fuelIn.model";
import { getFuelBalance, updateFuelBalance } from "./fuelBalance.service";
import config from "config";
import axios from "axios";
import { log } from "console";

const limitNo = config.get<number>("page_limit");

export const getFuelIn = async (query: FilterQuery<fuelInDocument>) => {
  try {
    return await fuelInModel.find(query).lean().select("-__v");
  } catch (e) {
    throw new Error(e);
  }
};

export const fuelInPaginate = async (
  pageNo: number,
  query: FilterQuery<fuelInDocument>
): Promise<{ count: number; data: fuelInDocument[] }> => {
  const limitNo = config.get<number>("page_limit");
  const reqPage = pageNo == 1 ? 0 : pageNo - 1;
  const skipCount = limitNo * reqPage;
  const data = await fuelInModel
    .find(query)
    .sort({ createAt: -1 })
    .skip(skipCount)
    .limit(limitNo)
    .lean()
    .select("-__v");

  const count = await fuelInModel.countDocuments(query);

  return { count, data };
};

export const addFuelIn = async (body: any) => {
  try {
    let no = await fuelInModel.count();
    let tankCondition = await getFuelBalance({
      stationId: body.user.stationId,
      fuelType: body.fuel_type,
      tankNo: body.tankNo,
      createAt: body.receive_date,
    });

    console.log(tankCondition, "this is tank condition", body);

    const updatedBody = {
      ...body,
      stationId: body.user.stationId,
      fuel_in_code: no + 1,
      tank_balance: tankCondition[0].balance,
    };

    let result = await new fuelInModel(updatedBody).save();

    await updateFuelBalance(
      { _id: tankCondition[0]._id },
      { fuelIn: body.receive_balance }
    );

    const url = config.get<string>("fuelInCloud");

    // console.log("===up=================================");
    // console.log(updatedBody);
    // console.log("===up=================================");

    try {
      let response = await axios.post(url, updatedBody);

      if (response.status == 200) {
        await fuelInModel.findByIdAndUpdate(result._id, {
          asyncAlready: "2",
        });
      } else {
        console.log("error is here fuel in");
      }
    } catch (error) {
      console.log("errr", error);
      if (error.response && error.response.status === 409) {
      } else {
      }
    }

    return result;
  } catch (e) {
    throw new Error(e);
  }
};

export const updateFuelIn = async (
  query: FilterQuery<fuelInDocument>,
  body: UpdateQuery<fuelInDocument>
) => {
  try {
    await fuelInModel.updateMany(query, body);
    return await fuelInModel.find(query).lean();
  } catch (e) {
    throw new Error(e);
  }
};

export const deleteFuelIn = async (query: FilterQuery<fuelInDocument>) => {
  try {
    let FuelIn = await fuelInModel.find(query);
    if (!FuelIn) {
      throw new Error("No FuelIn with that id");
    }
    return await fuelInModel.deleteMany(query);
  } catch (e) {
    throw new Error(e);
  }
};

export const fuelInByDate = async (
  query: FilterQuery<fuelInDocument>,
  d1: Date,
  d2: Date,
  pageNo: number
): Promise<{ count: number; data: fuelInDocument[] }> => {
  const reqPage = pageNo == 1 ? 0 : pageNo - 1;
  const skipCount = limitNo * reqPage;

  const filter: FilterQuery<fuelInDocument> = {
    ...query,
    createAt: {
      $gt: d1,
      $lt: d2,
    },
  };

  const data = await fuelInModel
    .find(filter)
    .sort({ createAt: -1 })
    .skip(skipCount)
    .limit(limitNo)
    .select("-__v");

  const count = await fuelInModel.countDocuments(filter);
  return { data, count };
};

export const addAtgFuelIn = async (body: any) => {
  try {
    let no = await fuelInModel.count();

    let tankUrl = config.get<string>("tankDataUrl");

    let tankRealTimeData = await axios.post(tankUrl);

    const tank = tankRealTimeData.data.data.find((ea) => ea.id == body.tankNo);

    const oilType = tank?.oilType;

    const opening = tank?.volume;

    let fuel_type;

    if (oilType === "Petrol 92") {
      fuel_type = "001-Octane Ron(92)";
    } else if (oilType === "95 Octane") {
      fuel_type = "002-Octane Ron(95)";
    } else if (oilType === "HSD") {
      fuel_type = "004-Diesel";
    } else if (oilType === "PHSD") {
      fuel_type = "005-Premium Diesel";
    }

    const fuelInObject = {
      stationDetailId: body.stationDetailId,
      driver: body.driver,
      bowser: body.bowser,
      tankNo: body.tankNo,
      fuel_type: fuel_type,
      fuel_in_code: no + 1,
      opening: opening,
      tank_balance: 0,
      receive_balance: 0,
      receive_date: new Date("YYYY-MM-DD"),
      asyncAlready: 0,
    };

    let result = await new fuelInModel(fuelInObject).save();

    return result;
  } catch (e) {
    console.log(e);
  }
};

export const updateAtgFuelIn = async (body: any) => {
  try {
    let tankUrl = config.get<string>("tankDataUrl");

    let tankRealTimeData = await axios.post(tankUrl);

    const tank = tankRealTimeData.data.data.find((ea) => ea.id == body.tankNo);

    const fuelIn = await fuelInModel.findOne({ _id: body.id });

    if (!fuelIn) {
      throw new Error("fuelIn document not found for the given ID");
    }

    const closing = tank?.volume;

    const opening = fuelIn?.opening;

    await fuelInModel.findByIdAndUpdate(body.id, {
      tank_balance: closing,
      receive_balance: closing - opening,
    });

    const result = await fuelInModel.findById(body.id);

    console.log(result, "this is result");

    try {
      const url = config.get<string>("atgFuelInCloud");

      let cloudObject = {
        stationDetailId: result?.stationDetailId,
        stationId: result?.stationDetailId,
        driver: result?.driver,
        bowser: result?.bowser,
        tankNo: result?.tankNo,
        fuel_type: result?.fuel_type,
        fuel_in_code: result?.fuel_in_code,
        opening: result?.opening,
        tank_balance: result?.tank_balance,
        receive_balance: result?.receive_balance.toString(),
        receive_date: result?.receive_date,
      };

      const response = await axios.post(url, cloudObject);

      if (response.status === 200) {
        await fuelInModel.findOneAndUpdate(body.id, {
          asyncAlready: 2,
        });
      } else {
        throw new Error("Cloud not connected");
      }
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }

    return result;
  } catch (error) {
    console.log(error);
  }
};
