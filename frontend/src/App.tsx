import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './modules/dashboard/Dashboard';
import InventoryPage from './modules/inventory/InventoryPage';
import CreateItemPage from './modules/inventory/CreateItemPage';
import ItemDetailPage from './modules/inventory/ItemDetailPage';
import EditItemPage from './modules/inventory/EditItemPage';
import CategoriesPage from './modules/inventory/CategoriesPage';
import CustomersPage from './modules/customers/CustomersPage';
import CreateCustomerPage from './modules/customers/CreateCustomerPage';
import EditCustomerPage from './modules/customers/EditCustomerPage';
import RentalsPage from './modules/rentals/RentalsPage';
import CreateRentalPage from './modules/rentals/CreateRentalPage';
import RentalDetailPage from './modules/rentals/RentalDetailPage';
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
    <QueryClientProvider client={queryClient}>
      <Router>
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;