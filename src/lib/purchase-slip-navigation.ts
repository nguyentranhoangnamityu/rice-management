export type PurchaseSlipNavigationState = {
  farmerId: string;
  farmerName?: string;
};

export function buildPurchaseSlipFromFarmerState(farmer: {
  id: string;
  name: string;
}): PurchaseSlipNavigationState {
  return {
    farmerId: farmer.id,
    farmerName: farmer.name,
  };
}
