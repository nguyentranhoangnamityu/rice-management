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
import { DryingPage } from "../pages/drying/DryingPage";
import { ProcessingRecordsPage } from "../pages/processing-records/ProcessingRecordsPage";
import { PurchaseSlipsPage } from "../pages/purchase-slips/PurchaseSlipsPage";
import { RiceTypesPage } from "../pages/rice-types/RiceTypesPage";
import { SeasonsPage } from "../pages/seasons/SeasonsPage";
import { TransporterBoatDetailPage } from "../pages/transporter-boats/TransporterBoatDetailPage";
import { TransporterBoatsPage } from "../pages/transporter-boats/TransporterBoatsPage";
import { TransportRoutesPage } from "../pages/transport-routes/TransportRoutesPage";
import { TripsPage } from "../pages/trips/TripsPage";
import { TripDetailPage } from "../pages/trips/TripDetailPage";
import { UsersPage } from "../pages/users/UsersPage";
import { WarehousesPage } from "../pages/warehouses/WarehousesPage";

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
          <Route path="trips" element={<TripsPage />} />
          <Route path="trips/:id" element={<TripDetailPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="purchase-slips" element={<PurchaseSlipsPage />} />
          <Route path="authorization-letters" element={<AuthorizationLettersPage />} />
          <Route path="transporter-boats" element={<TransporterBoatsPage />} />
          <Route path="transporter-boats/:id" element={<TransporterBoatDetailPage />} />
          <Route path="transport-routes" element={<TransportRoutesPage />} />
          <Route path="factories" element={<FactoriesPage />} />
          <Route path="drying" element={<DryingPage />} />
          <Route path="processing-records" element={<ProcessingRecordsPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="attachments" element={<AttachmentsPage />} />
          <Route path="exports" element={<ExportsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
