import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './modules/dashboard/Dashboard';
import Skeleton from './components/Skeleton';
import InventoryPage from './modules/inventory/InventoryPage';
import CreateItemPage from './modules/inventory/CreateItemPage';
import ItemDetailPage from './modules/inventory/ItemDetailPage';
import EditItemPage from './modules/inventory/EditItemPage';
import CategoriesPage from './modules/inventory/CategoriesPage';
import CustomersPage from './modules/customers/CustomersPage';
import CreateCustomerPage from './modules/customers/CreateCustomerPage';
import EditCustomerPage from './modules/customers/EditCustomerPage';
import ViewCustomerPage from './modules/customers/ViewCustomerPage';
import RentalsPage from './modules/rentals/RentalsPage';
import CreateRentalPage from './modules/rentals/CreateRentalPage';
import RentalDetailPage from './modules/rentals/RentalDetailPage';
import ExpirationDashboardPage from './modules/rentals/ExpirationDashboardPage';
import MaintenancesPage from './modules/maintenance/MaintenancesPage';
import CreateMaintenancePage from './modules/maintenance/CreateMaintenancePage';
import MaintenanceDetailPage from './modules/maintenance/MaintenanceDetailPage';
import FinancialDashboardPage from './modules/transactions/FinancialDashboardPage';
import InvoicesPage from './modules/invoices/InvoicesPage';
import ReportsPage from './modules/reports/ReportsPage';
import AdminPage from './modules/subscriptions/AdminPage';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Suspense fallback={<Skeleton className="w-full h-screen" />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/items"
                element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/items/new"
                element={
                  <ProtectedRoute>
                    <CreateItemPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/items/:id"
                element={
                  <ProtectedRoute>
                    <ItemDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/items/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditItemPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/categories"
                element={
                  <ProtectedRoute>
                    <CategoriesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute>
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/new"
                element={
                  <ProtectedRoute>
                    <CreateCustomerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/:id"
                element={
                  <ProtectedRoute>
                    <ViewCustomerPage /> {/* você precisaria criar essa página */}
                  </ProtectedRoute>
                }
              />

              <Route
                path="/customers/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditCustomerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rentals"
                element={
                  <ProtectedRoute>
                    <RentalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rentals/new"
                element={
                  <ProtectedRoute>
                    <CreateRentalPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rentals/:id"
                element={
                  <ProtectedRoute>
                    <RentalDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rentals/expiration-dashboard"
                element={
                  <ProtectedRoute>
                    <ExpirationDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance"
                element={
                  <ProtectedRoute>
                    <MaintenancesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance/new"
                element={
                  <ProtectedRoute>
                    <CreateMaintenancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance/:id"
                element={
                  <ProtectedRoute>
                    <MaintenanceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance"
                element={
                  <ProtectedRoute requiredRoles={['admin', 'superadmin']}>
                    <FinancialDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ProtectedRoute>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRoles={['superadmin']}>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="colored"
            />
          </Suspense>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;