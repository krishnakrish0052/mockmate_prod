import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Import webapp components
import WebApp from './webapp/App';

// Import admin components
import AdminApp from './admin/App';

// Import shared context
import { PolicyProvider } from './contexts/PolicyContext';

// Import dynamic icon utilities
import { initializeDynamicIcons } from './utils/iconLoader';

function App() {
  // Initialize dynamic icons on app startup
  useEffect(() => {
    initializeDynamicIcons().catch(error => {
      console.warn('Failed to initialize dynamic icons:', error);
    });
  }, []);

  return (
    <Router>
      <PolicyProvider>
        <Routes>
          {/* Admin routes - must come first due to more specific paths */}
          <Route path='/admin/*' element={<AdminApp />} />

          {/* Web app routes - catches all non-admin routes */}
          <Route path='/*' element={<WebApp />} />
        </Routes>
      </PolicyProvider>
    </Router>
  );
}

export default App;
