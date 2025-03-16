import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import EmailDashboard from "./components/EmailDashboard";
import React from "react";
import SettingsPage from "./components/SettingsPage";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<EmailDashboard />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Router>
  );
};

export default App;
