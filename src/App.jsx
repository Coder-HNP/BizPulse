import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { PrivateRoute } from './components/common/PrivateRoute';
import { Layout } from './components/layout/Layout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import RawMaterials from './pages/RawMaterials';
import Production from './pages/Production';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Receivables from './pages/Receivables';
import Expenses from './pages/Expenses';
import Finance from './pages/Finance';

// Placeholder Dashboard for now
const Dashboard = () => <div className="p-4">Dashboard Content</div>;

function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/onboarding" element={
              <PrivateRoute>
                <Onboarding />
              </PrivateRoute>
            } />

            <Route element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/raw-materials" element={<RawMaterials />} />
              <Route path="/production" element={<Production />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/receivables" element={<Receivables />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/finance" element={<Finance />} />
            </Route>
          </Routes>
        </Router>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default App;
