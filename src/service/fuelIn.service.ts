import { FilterQuery, UpdateQuery } from "mongoose";
import fuelInModel, { fuelInDocument } from "../model/fuelIn.model";
import { getFuelBalance, updateFuelBalance } from "./fuelBalance.service";
import config from "config";
import axios from "axios";

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
  // console.log(body , "this is body")
  try {
    let no = await fuelInModel.count();
    let tankCondition = await getFuelBalance({
      stationId: body.user.stationId,
      fuelType: body.fuel_type,
      tankNo: body.tankNo,
      createAt: body.receive_date,
    });
    // console.log(tankCondition);

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
