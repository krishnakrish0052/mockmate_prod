import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Chip,
  IconButton,
  InputAdornment,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Add,
  Delete,
  ExpandMore,
  Info,
  Security,
  Settings,
  Payment,
} from '@mui/icons-material';

const PaymentProviderForm = ({ open, onClose, editingConfig, onSuccess, onError }) => {
  if (!open) return null;
  
  return (
    <div>
      <h3>Payment Provider Form</h3>
      <p>Payment provider configuration form - to be implemented</p>
      <button onClick={onClose}>Close</button>
    </div>
  );
};

export default PaymentProviderForm;
