import fs from 'fs/promises';
import path from 'path';

/**
 * Simple test to verify email template variable substitution
 */

function extractVariables(htmlContent) {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables = [];
  let match;

  while ((match = variableRegex.exec(htmlContent)) !== null) {
    const variable = match[1].trim();
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }
  return variables;
}

function generateTestData(variables) {
  const testData = {};
  variables.forEach(variable => {
    if (variable.includes('EMAIL')) testData[variable] = 'test@mockmate.ai';
    else if (variable.includes('NAME')) testData[variable] = 'John Doe';
    else if (variable.includes('URL')) testData[variable] = 'https://mockmate.ai/test';
    else if (variable.includes('DATE')) testData[variable] = new Date().toLocaleDateString();
    else if (variable.includes('TIME')) testData[variable] = '2:00 PM EST';
    else if (variable.includes('AMOUNT') || variable.includes('PRICE')) testData[variable] = '29.99';
    else if (variable.includes('CODE') || variable.includes('TOKEN')) testData[variable] = 'ABC123XYZ';
    else if (variable.includes('SCORE')) testData[variable] = '85';
    else if (variable.includes('DURATION')) testData[variable] = '45';
    else if (variable.includes('HOURS')) testData[variable] = '24';
    else if (variable.includes('DAYS')) testData[variable] = '7';
    else if (variable.includes('COMPANY')) testData[variable] = 'Tech Corp';
    else if (variable.includes('POSITION')) testData[variable] = 'Software Engineer';
    else if (variable.includes('PLAN')) testData[variable] = 'Premium Plan';
    else if (variable.includes('INVOICE')) testData[variable] = 'INV-2024-001';
    else if (variable.includes('TRANSACTION')) testData[variable] = 'TXN-123456789';
    else if (variable.includes('FEEDBACK')) testData[variable] = 'Great performance!';
    else testData[variable] = `Test_${variable}`;
  });
  return testData;
}

function renderTemplate(htmlContent, templateData) {
  let rendered = htmlContent;
  for (const [key, value] of Object.entries(templateData)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    rendered = rendered.replace(regex, String(value || ''));
  }
  return rendered;
}

async function testEmailTemplates() {
  console.log('🚀 Testing Email Template Variables\n');

  try {
    const templatesDir = path.resolve('../email-templates');
    const files = await fs.readdir(templatesDir);
    const htmlFiles = files.filter(file => file.endsWith('.html'));

    console.log(`Found ${htmlFiles.length} HTML templates\n`);

    let passed = 0;
    let failed = 0;

    for (const file of htmlFiles) {
      const templateName = path.basename(file, '.html');
      const templatePath = path.join(templatesDir, file);
      
      console.log(`📄 Testing: ${templateName}`);

      const htmlContent = await fs.readFile(templatePath, 'utf8');
      const variables = extractVariables(htmlContent);
      
      console.log(`   Variables found: ${variables.length}`);
      if (variables.length > 0) {
        console.log(`   Variables: ${variables.join(', ')}`);
      }

      const testData = generateTestData(variables);
      const rendered = renderTemplate(htmlContent, testData);
      const remaining = extractVariables(rendered);

      if (remaining.length === 0) {
        console.log(`   ✅ PASS - All ${variables.length} variables substituted`);
        passed++;
      } else {
        console.log(`   ❌ FAIL - ${remaining.length} variables not substituted: ${remaining.join(', ')}`);
        failed++;
      }
      console.log('');
    }

    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(40));
    console.log(`Total templates: ${passed + failed}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testEmailTemplates();
