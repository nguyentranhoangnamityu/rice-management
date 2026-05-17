import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";
import { HomeRedirect } from "../components/layout/HomeRedirect";
import { MobileMenuPage } from "../components/layout/MobileMenuPage";
import { AuthorizationLettersPage } from "../pages/authorization-letters/AuthorizationLettersPage";
import { AttachmentsPage } from "../pages/attachments/AttachmentsPage";
import { BrokersPage } from "../pages/brokers/BrokersPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { DebtsPage } from "../pages/debts/DebtsPage";
import { ExportsPage } from "../pages/exports/ExportsPage";
import { FactoriesPage } from "../pages/factories/FactoriesPage";
import { FarmersPage } from "../pages/farmers/FarmersPage";
import { LoginPage } from "../pages/login/LoginPage";
import { ProcessingRecordsPage } from "../pages/processing-records/ProcessingRecordsPage";
import { PurchaseBatchDetailPage } from "../pages/purchase-batches/PurchaseBatchDetailPage";
import { PurchaseBatchesPage } from "../pages/purchase-batches/PurchaseBatchesPage";
import { PurchaseItemsPage } from "../pages/purchase-items/PurchaseItemsPage";
import { PurchaseSlipsPage } from "../pages/purchase-slips/PurchaseSlipsPage";
import { RiceTypesPage } from "../pages/rice-types/RiceTypesPage";
import { SeasonsPage } from "../pages/seasons/SeasonsPage";
import { TransporterBoatsPage } from "../pages/transporter-boats/TransporterBoatsPage";
import { TransportRoutesPage } from "../pages/transport-routes/TransportRoutesPage";
import { TransportTripsPage } from "../pages/transport-trips/TransportTripsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="menu" element={<MobileMenuPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rice-types" element={<RiceTypesPage />} />
          <Route path="seasons" element={<SeasonsPage />} />
          <Route path="farmers" element={<FarmersPage />} />
          <Route path="brokers" element={<BrokersPage />} />
          <Route path="purchase-slips" element={<PurchaseSlipsPage />} />
          <Route path="authorization-letters" element={<AuthorizationLettersPage />} />
          <Route path="purchase-batches" element={<PurchaseBatchesPage />} />
          <Route path="purchase-batches/:batchId" element={<PurchaseBatchDetailPage />} />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
