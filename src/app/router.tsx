import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { AttachmentsPage } from "../pages/attachments/AttachmentsPage";
import { BrokersPage } from "../pages/brokers/BrokersPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { DebtsPage } from "../pages/debts/DebtsPage";
import { ExportsPage } from "../pages/exports/ExportsPage";
import { FactoriesPage } from "../pages/factories/FactoriesPage";
import { FarmersPage } from "../pages/farmers/FarmersPage";
import { ProcessingRecordsPage } from "../pages/processing-records/ProcessingRecordsPage";
import { PurchaseBatchesPage } from "../pages/purchase-batches/PurchaseBatchesPage";
import { PurchaseItemsPage } from "../pages/purchase-items/PurchaseItemsPage";
import { RiceTypesPage } from "../pages/rice-types/RiceTypesPage";
import { SeasonsPage } from "../pages/seasons/SeasonsPage";
import { TransporterBoatsPage } from "../pages/transporter-boats/TransporterBoatsPage";
import { TransportRoutesPage } from "../pages/transport-routes/TransportRoutesPage";
import { TransportTripsPage } from "../pages/transport-trips/TransportTripsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="rice-types" element={<RiceTypesPage />} />
        <Route path="seasons" element={<SeasonsPage />} />
        <Route path="farmers" element={<FarmersPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="purchase-batches" element={<PurchaseBatchesPage />} />
        <Route path="purchase-items" element={<PurchaseItemsPage />} />
        <Route path="transporter-boats" element={<TransporterBoatsPage />} />
        <Route path="transport-trips" element={<TransportTripsPage />} />
        <Route path="transport-routes" element={<TransportRoutesPage />} />
        <Route path="factories" element={<FactoriesPage />} />
        <Route path="processing-records" element={<ProcessingRecordsPage />} />
        <Route path="debts" element={<DebtsPage />} />
        <Route path="attachments" element={<AttachmentsPage />} />
        <Route path="exports" element={<ExportsPage />} />
      </Route>
    </Routes>
  );
}
