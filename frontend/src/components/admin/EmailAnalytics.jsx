import React, { useState, useEffect } from 'react';
import React from 'react';

const EmailAnalytics = () => {
  return (
    <div>
      <h2>Email Analytics</h2>
      <p>Email analytics component - to be implemented</p>
    </div>
  );
};

export default EmailAnalytics;

              value={analytics.overview.total_sent}
              change={analytics.overview.sent_change}
              icon={Mail}
              color='primary'
            />
            <MetricCard
              title='Delivered'
              value={analytics.overview.delivered}
              percentage={analytics.overview.delivery_rate}
              icon={CheckCircle}
              color='success'
            />
            <MetricCard
              title='Opened'
              value={analytics.overview.opened}
              percentage={analytics.overview.open_rate}
              icon={Eye}
              color='info'
            />
            <MetricCard
              title='Clicked'
              value={analytics.overview.clicked}
              percentage={analytics.overview.click_rate}
              icon={MousePointer}
              color='warning'
            />
          </div>

          {/* Charts */}
          <div className='mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2'>
            {/* Email Volume Trend */}
            <ChartCard title='Email Volume Trend' className='lg:col-span-2'>
              <ResponsiveContainer width='100%' height={300}>
                <AreaChart data={analytics.timeline}>
                  <defs>
                    <linearGradient id='colorSent' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor={colors.primary} stopOpacity={0.3} />
                      <stop offset='95%' stopColor={colors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id='colorDelivered' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor={colors.success} stopOpacity={0.3} />
                      <stop offset='95%' stopColor={colors.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
                  <XAxis dataKey='date' stroke='#9ca3af' tick={{ fontSize: 12 }} />
                  <YAxis stroke='#9ca3af' tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f9fafb',
                    }}
                  />
                  <Legend />
                  <Area
                    type='monotone'
                    dataKey='sent'
                    stroke={colors.primary}
                    fillOpacity={1}
                    fill='url(#colorSent)'
                    name='Sent'
                  />
                  <Area
                    type='monotone'
                    dataKey='delivered'
                    stroke={colors.success}
                    fillOpacity={1}
                    fill='url(#colorDelivered)'
                    name='Delivered'
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Engagement Rates */}
            <ChartCard title='Engagement Rates'>
              <ResponsiveContainer width='100%' height={300}>
                <LineChart data={analytics.timeline}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
                  <XAxis dataKey='date' stroke='#9ca3af' tick={{ fontSize: 12 }} />
                  <YAxis stroke='#9ca3af' tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f9fafb',
                    }}
                    formatter={value => [`${value}%`, '']}
                  />
                  <Legend />
                  <Line
                    type='monotone'
                    dataKey='open_rate'
                    stroke={colors.info}
                    strokeWidth={2}
                    name='Open Rate'
                    dot={{ r: 4 }}
                  />
                  <Line
                    type='monotone'
                    dataKey='click_rate'
                    stroke={colors.warning}
                    strokeWidth={2}
                    name='Click Rate'
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Email Status Distribution */}
            <ChartCard title='Email Status Distribution'>
              <ResponsiveContainer width='100%' height={300}>
                <PieChart>
                  <Pie
                    data={analytics.status_distribution}
                    cx='50%'
                    cy='50%'
                    outerRadius={80}
                    fill='#8884d8'
                    dataKey='count'
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  >
                    {analytics.status_distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f9fafb',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Template Performance */}
          <ChartCard title='Template Performance' className='mb-8'>
            <ResponsiveContainer width='100%' height={400}>
              <BarChart data={analytics.template_performance} margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
                <XAxis
                  dataKey='template_name'
                  stroke='#9ca3af'
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor='end'
                  height={100}
                />
                <YAxis stroke='#9ca3af' tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                  }}
                />
                <Legend />
                <Bar dataKey='sent' fill={colors.primary} name='Sent' radius={[2, 2, 0, 0]} />
                <Bar
                  dataKey='delivered'
                  fill={colors.success}
                  name='Delivered'
                  radius={[2, 2, 0, 0]}
                />
                <Bar dataKey='opened' fill={colors.info} name='Opened' radius={[2, 2, 0, 0]} />
                <Bar dataKey='clicked' fill={colors.warning} name='Clicked' radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Recent Activity */}
          <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
            {/* Top Performing Templates */}
            <div className='rounded border border-cli-gray bg-cli-dark p-6'>
              <h3 className='mb-4 flex items-center gap-2 font-mono text-lg font-semibold text-cli-white'>
                <Target className='h-5 w-5 text-cli-amber' />
                Top Performing Templates
              </h3>
              <div className='space-y-3'>
                {analytics.top_templates?.map((template, index) => (
                  <div
                    key={template.id}
                    className='flex items-center justify-between rounded bg-cli-darker p-3'
                  >
                    <div className='flex items-center gap-3'>
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          index === 0
                            ? 'bg-cli-amber text-cli-black'
                            : index === 1
                              ? 'bg-cli-light-gray text-cli-black'
                              : 'bg-cli-gray text-cli-white'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p className='font-mono font-medium text-cli-white'>
                          {template.display_name}
                        </p>
                        <p className='text-sm text-cli-light-gray'>{template.category}</p>
                      </div>
                    </div>
                    <div className='text-right'>
                      <p className='font-mono font-bold text-cli-green'>{template.open_rate}%</p>
                      <p className='text-sm text-cli-light-gray'>open rate</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Failures */}
            <div className='rounded border border-cli-gray bg-cli-dark p-6'>
              <h3 className='mb-4 flex items-center gap-2 font-mono text-lg font-semibold text-cli-white'>
                <AlertTriangle className='text-cli-red h-5 w-5' />
                Recent Failures
              </h3>
              <div className='space-y-3'>
                {analytics.recent_failures?.map((failure, index) => (
                  <div key={index} className='flex items-start gap-3 rounded bg-cli-darker p-3'>
                    <XCircle className='text-cli-red mt-1 h-4 w-4 flex-shrink-0' />
                    <div className='flex-1'>
                      <p className='font-mono text-sm text-cli-white'>{failure.template_name}</p>
                      <p className='text-cli-red text-sm'>{failure.error_message}</p>
                      <div className='mt-1 flex items-center gap-2'>
                        <Clock className='h-3 w-3 text-cli-light-gray' />
                        <p className='text-xs text-cli-light-gray'>{failure.failed_at}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {(!analytics.recent_failures || analytics.recent_failures.length === 0) && (
                  <div className='py-8 text-center'>
                    <CheckCircle className='mx-auto mb-2 h-12 w-12 text-cli-green' />
                    <p className='text-cli-light-gray'>No recent failures</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, percentage, change, icon: Icon, color }) => {
  const getColorClass = color => {
    const colorMap = {
      primary: 'text-cli-amber',
      success: 'text-cli-green',
      danger: 'text-cli-red',
      warning: 'text-cli-orange',
      info: 'text-cli-cyan',
      secondary: 'text-cli-light-gray',
    };
    return colorMap[color] || 'text-cli-white';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className='rounded border border-cli-gray bg-cli-dark p-6'
    >
      <div className='mb-3 flex items-center justify-between'>
        <div
          className={`rounded p-2 ${
            color === 'primary'
              ? 'bg-cli-amber bg-opacity-20'
              : color === 'success'
                ? 'bg-cli-green bg-opacity-20'
                : color === 'info'
                  ? 'bg-cli-cyan bg-opacity-20'
                  : color === 'warning'
                    ? 'bg-cli-orange bg-opacity-20'
                    : 'bg-cli-gray'
          }`}
        >
          <Icon className={`h-5 w-5 ${getColorClass(color)}`} />
        </div>
        {change !== undefined && (
          <div
            className={`flex items-center gap-1 text-sm ${
              change >= 0 ? 'text-cli-green' : 'text-cli-red'
            }`}
          >
            <TrendingUp className='h-4 w-4' />
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className='text-sm font-medium text-cli-light-gray'>{title}</p>
        <div className='flex items-end gap-2'>
          <p className='font-mono text-2xl font-bold text-cli-white'>{value.toLocaleString()}</p>
          {percentage !== undefined && (
            <p className={`pb-1 text-sm font-medium ${getColorClass(color)}`}>
              {percentage.toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Chart Card Component
const ChartCard = ({ title, children, className = '' }) => (
  <div className={`rounded border border-cli-gray bg-cli-dark p-6 ${className}`}>
    <h3 className='mb-4 flex items-center gap-2 font-mono text-lg font-semibold text-cli-white'>
      <BarChart3 className='h-5 w-5 text-cli-amber' />
      {title}
    </h3>
    {children}
  </div>
);

export default EmailAnalytics;
