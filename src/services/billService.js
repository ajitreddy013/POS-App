import { dbService } from "./dbService";

export const addPendingBill = async (billData) => {
  return await dbService.addPendingBill(billData);
};

export const getPendingBills = async () => {
  return await dbService.getPendingBills();
};

export const updatePendingBill = async (id, billData) => {
  return await dbService.updatePendingBill(id, billData);
};

export const deletePendingBill = async (id) => {
  return await dbService.deletePendingBill(id);
};

export const clearPendingBill = async (id) => {
  return await dbService.clearPendingBill(id);
};

export const generateBill = async (billData) => {
  return await dbService.exportStockReport(billData); // Fallback no-op
};
