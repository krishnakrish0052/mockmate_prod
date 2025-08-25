import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Switch, 
  Button, 
  Form, 
  Input, 
  Select, 
  Space, 
  Alert, 
  Badge, 
  Divider,
  Typography,
  Row,
  Col,
  Modal,
  notification
} from 'antd';
import { 
  CreditCardOutlined, 
  SettingOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined 
} from '@ant-design/icons';
import { adminApi } from '../../services/admin/adminApi';

const { Title, Text } = Typography;
const { Option } = Select;

const PaymentGatewaysTab = () => {
  const [loading, setLoading] = useState(true);
  const [gateways, setGateways] = useState([]);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchPaymentGateways();
  }, []);

  const fetchPaymentGateways = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getPaymentConfigurations();
      if (response.success) {
        setGateways(response.data.configs);
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'Failed to fetch payment gateways',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleGateway = async (gatewayId, isActive) => {
    try {
      const response = await adminApi.togglePaymentGateway(gatewayId, isActive);
      if (response.success) {
        notification.success({
          message: 'Success',
          description: `Payment gateway ${isActive ? 'enabled' : 'disabled'} successfully`,
        });
        fetchPaymentGateways();
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'Failed to update payment gateway status',
      });
    }
  };

  const runHealthCheck = async (gatewayId) => {
    try {
      const response = await adminApi.testPaymentConfiguration(gatewayId, 'connectivity');
      if (response.success) {
        notification.success({
          message: 'Health Check',
          description: `Gateway test ${response.data.status === 'pass' ? 'passed' : 'failed'}`,
        });
        fetchPaymentGateways();
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'Failed to run health check',
      });
    }
  };

  const openConfigModal = (gateway) => {
    setSelectedGateway(gateway);
    
    // Pre-populate form with gateway configuration
    const config = gateway.configuration || {};
    
    if (gateway.provider_name === 'stripe') {
      form.setFieldsValue({
        secret_key: config.secret_key || '',
        publishable_key: config.publishable_key || '',
        webhook_secret: config.webhook_secret || '',
      });
    } else if (gateway.provider_name === 'cashfree') {
      form.setFieldsValue({
        app_id: config.app_id || '',
        secret_key: config.secret_key || '',
        is_test_mode: config.is_test_mode ?? true,
      });
    }
    
    setConfigModalVisible(true);
  };

  const updateGatewayConfig = async (values) => {
    try {
      const updateData = {
        configuration: values,
        is_test_mode: values.is_test_mode ?? true,
      };

      const response = await adminApi.updatePaymentConfiguration(selectedGateway.id, updateData);
      
      if (response.success) {
        notification.success({
          message: 'Success',
          description: 'Payment gateway configuration updated successfully',
        });
        setConfigModalVisible(false);
        form.resetFields();
        setSelectedGateway(null);
        fetchPaymentGateways();
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: 'Failed to update gateway configuration',
      });
    }
  };

  const getHealthStatusBadge = (gateway) => {
    const status = gateway.health_status || 'unknown';
    const statusConfig = {
      pass: { status: 'success', text: 'Healthy' },
      warn: { status: 'warning', text: 'Warning' },
      fail: { status: 'error', text: 'Failed' },
      unknown: { status: 'default', text: 'Unknown' },
    };

    return (
      <Badge 
        status={statusConfig[status].status} 
        text={statusConfig[status].text}
      />
    );
  };

  const getGatewayIcon = (providerName) => {
    const icons = {
      stripe: '💳',
      cashfree: '🇮🇳',
    };
    return icons[providerName] || '💰';
  };

  const renderStripeConfig = () => (
    <>
      <Form.Item
        name="secret_key"
        label="Secret Key"
        rules={[{ required: true, message: 'Please enter Stripe secret key' }]}
      >
        <Input.Password placeholder="sk_test_..." />
      </Form.Item>

      <Form.Item
        name="publishable_key"
        label="Publishable Key"
        rules={[{ required: true, message: 'Please enter Stripe publishable key' }]}
      >
        <Input placeholder="pk_test_..." />
      </Form.Item>

      <Form.Item
        name="webhook_secret"
        label="Webhook Secret"
        rules={[{ required: true, message: 'Please enter webhook secret' }]}
      >
        <Input.Password placeholder="whsec_..." />
      </Form.Item>
    </>
  );

  const renderCashfreeConfig = () => (
    <>
      <Form.Item
        name="app_id"
        label="App ID"
        rules={[{ required: true, message: 'Please enter Cashfree App ID' }]}
      >
        <Input placeholder="Your Cashfree App ID" />
      </Form.Item>

      <Form.Item
        name="secret_key"
        label="Secret Key"
        rules={[{ required: true, message: 'Please enter Cashfree secret key' }]}
      >
        <Input.Password placeholder="Your Cashfree Secret Key" />
      </Form.Item>

      <Form.Item
        name="is_test_mode"
        label="Test Mode"
        valuePropName="checked"
      >
        <Switch checkedChildren="Test" unCheckedChildren="Live" />
      </Form.Item>
    </>
  );

  return (
    <div className="payment-gateways-tab">
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>
          <CreditCardOutlined /> Payment Gateways
        </Title>
        <Text type="secondary">
          Manage payment gateway configurations and monitor their health status.
        </Text>
      </div>

      <Alert
        message="Payment Gateway Management"
        description="Enable or disable payment gateways, configure credentials, and monitor connectivity. Changes take effect immediately."
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[16, 16]}>
        {gateways.map((gateway) => (
          <Col xs={24} sm={12} lg={8} key={gateway.id}>
            <Card
              title={
                <Space>
                  <span style={{ fontSize: '20px' }}>
                    {getGatewayIcon(gateway.provider_name)}
                  </span>
                  {gateway.display_name || gateway.provider_name}
                </Space>
              }
              extra={
                <Switch
                  checked={gateway.is_active}
                  onChange={(checked) => toggleGateway(gateway.id, checked)}
                  size="small"
                />
              }
              actions={[
                <Button
                  key="config"
                  icon={<SettingOutlined />}
                  onClick={() => openConfigModal(gateway)}
                  size="small"
                >
                  Configure
                </Button>,
                <Button
                  key="test"
                  icon={<CheckCircleOutlined />}
                  onClick={() => runHealthCheck(gateway.id)}
                  size="small"
                  disabled={!gateway.is_active}
                >
                  Test
                </Button>,
              ]}
              style={{
                opacity: gateway.is_active ? 1 : 0.6,
                border: gateway.is_active ? '2px solid #52c41a' : '1px solid #d9d9d9',
              }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Text strong>Status: </Text>
                  {getHealthStatusBadge(gateway)}
                </div>
                
                <div>
                  <Text strong>Type: </Text>
                  <Text>{gateway.provider_type}</Text>
                </div>

                <div>
                  <Text strong>Mode: </Text>
                  <Badge 
                    status={gateway.is_test_mode ? 'processing' : 'success'} 
                    text={gateway.is_test_mode ? 'Test' : 'Live'}
                  />
                </div>

                <div>
                  <Text strong>Priority: </Text>
                  <Text>{gateway.priority}</Text>
                </div>

                {gateway.last_health_check && (
                  <div>
                    <Text strong>Last Check: </Text>
                    <Text type="secondary">
                      {new Date(gateway.last_health_check).toLocaleString()}
                    </Text>
                  </div>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Configuration Modal */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: '20px' }}>
              {selectedGateway && getGatewayIcon(selectedGateway.provider_name)}
            </span>
            Configure {selectedGateway?.display_name}
          </Space>
        }
        visible={configModalVisible}
        onCancel={() => {
          setConfigModalVisible(false);
          form.resetFields();
          setSelectedGateway(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={updateGatewayConfig}
        >
          {selectedGateway?.provider_name === 'stripe' && renderStripeConfig()}
          {selectedGateway?.provider_name === 'cashfree' && renderCashfreeConfig()}

          <Divider />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Update Configuration
              </Button>
              <Button 
                onClick={() => {
                  setConfigModalVisible(false);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PaymentGatewaysTab;
