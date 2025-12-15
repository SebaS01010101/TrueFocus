/**
 * Script de prueba para verificar la conexión con ThingsBoard
 *
 * Este script verifica:
 * 1. Autenticación con ThingsBoard
 * 2. Lectura de telemetría del dispositivo
 * 3. Envío de telemetría de prueba
 *
 * Uso: node test-thingsboard.js
 */

const axios = require('axios');

// Configuración
const TB_HOST = 'http://iot.ceisufro.cl:8080';
const DEVICE_ID = '76f07260-cb35-11f0-a6b4-77216114eb61';
const ACCESS_TOKEN = '354ee7omsirwgui3zdzx';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

// Test 1: Enviar telemetría al dispositivo
async function testSendTelemetry() {
  header('TEST 1: Enviar Telemetría de Prueba');

  try {
    const url = `${TB_HOST}/api/v1/${ACCESS_TOKEN}/telemetry`;

    const testData = {
      distance: 55.5,
      presence: true,
      timestamp: Date.now(),
      test: true
    };

    log(`URL: ${url}`, 'blue');
    log(`Datos: ${JSON.stringify(testData, null, 2)}`, 'blue');

    const response = await axios.post(url, testData);

    if (response.status === 200) {
      log('✓ Telemetría enviada exitosamente', 'green');
      return true;
    } else {
      log(`✗ Error: Código de estado ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log('✗ Error al enviar telemetría:', 'red');
    log(error.message, 'red');
    if (error.response) {
      log(`Respuesta del servidor: ${error.response.status}`, 'red');
      log(JSON.stringify(error.response.data), 'red');
    }
    return false;
  }
}

// Test 2: Autenticación con credenciales de usuario
async function testAuthentication(email, password) {
  header('TEST 2: Autenticación de Usuario');

  try {
    const url = `${TB_HOST}/api/auth/login`;

    log(`URL: ${url}`, 'blue');
    log(`Email: ${email}`, 'blue');

    const response = await axios.post(url, {
      username: email,
      password: password
    });

    if (response.data.token) {
      log('✓ Autenticación exitosa', 'green');
      log(`Token JWT obtenido (primeros 50 caracteres): ${response.data.token.substring(0, 50)}...`, 'green');
      return response.data.token;
    } else {
      log('✗ No se obtuvo token JWT', 'red');
      return null;
    }
  } catch (error) {
    log('✗ Error de autenticación:', 'red');
    log(error.message, 'red');
    if (error.response) {
      log(`Respuesta del servidor: ${error.response.status}`, 'red');
    }
    return null;
  }
}

// Test 3: Leer telemetría del dispositivo
async function testReadTelemetry(jwt) {
  header('TEST 3: Leer Telemetría del Dispositivo');

  try {
    const url = `${TB_HOST}/api/plugins/telemetry/DEVICE/${DEVICE_ID}/values/timeseries?keys=distance,presence`;

    log(`URL: ${url}`, 'blue');
    log(`Device ID: ${DEVICE_ID}`, 'blue');

    const response = await axios.get(url, {
      headers: {
        'X-Authorization': `Bearer ${jwt}`
      }
    });

    if (response.status === 200) {
      log('✓ Telemetría leída exitosamente', 'green');

      if (response.data.distance && response.data.distance.length > 0) {
        const distanceData = response.data.distance[0];
        log(`  Distance: ${distanceData.value} cm`, 'green');
        log(`  Timestamp: ${new Date(distanceData.ts).toLocaleString()}`, 'green');
      } else {
        log('  ⚠ No hay datos de distancia', 'yellow');
      }

      if (response.data.presence && response.data.presence.length > 0) {
        const presenceData = response.data.presence[0];
        log(`  Presence: ${presenceData.value}`, 'green');
        log(`  Timestamp: ${new Date(presenceData.ts).toLocaleString()}`, 'green');
      } else {
        log('  ⚠ No hay datos de presencia', 'yellow');
      }

      return true;
    } else {
      log(`✗ Error: Código de estado ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log('✗ Error al leer telemetría:', 'red');
    log(error.message, 'red');
    if (error.response) {
      log(`Respuesta del servidor: ${error.response.status}`, 'red');
      log(JSON.stringify(error.response.data), 'red');
    }
    return false;
  }
}

// Test 4: Verificar conectividad con el servidor
async function testConnectivity() {
  header('TEST 4: Verificar Conectividad');

  try {
    log(`Probando conexión a: ${TB_HOST}`, 'blue');

    const response = await axios.get(`${TB_HOST}/`, { timeout: 5000 });

    log('✓ Servidor accesible', 'green');
    log(`Código de estado: ${response.status}`, 'green');
    return true;
  } catch (error) {
    log('✗ Servidor no accesible:', 'red');
    log(error.message, 'red');
    return false;
  }
}

// Test 5: Información del dispositivo
async function testDeviceInfo(jwt) {
  header('TEST 5: Información del Dispositivo');

  try {
    const url = `${TB_HOST}/api/device/${DEVICE_ID}`;

    log(`URL: ${url}`, 'blue');

    const response = await axios.get(url, {
      headers: {
        'X-Authorization': `Bearer ${jwt}`
      }
    });

    if (response.status === 200) {
      log('✓ Información del dispositivo obtenida', 'green');
      log(`  Nombre: ${response.data.name}`, 'green');
      log(`  Tipo: ${response.data.type}`, 'green');
      log(`  Etiqueta: ${response.data.label || 'N/A'}`, 'green');
      return true;
    } else {
      log(`✗ Error: Código de estado ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log('✗ Error al obtener información del dispositivo:', 'red');
    log(error.message, 'red');
    if (error.response) {
      log(`Respuesta del servidor: ${error.response.status}`, 'red');
    }
    return false;
  }
}

// Función principal
async function runTests() {
  console.clear();
  log('\n🔍 PRUEBAS DE INTEGRACIÓN THINGSBOARD - TRUEFOCUS\n', 'cyan');

  log('Configuración:', 'yellow');
  log(`  Host: ${TB_HOST}`, 'yellow');
  log(`  Device ID: ${DEVICE_ID}`, 'yellow');
  log(`  Access Token: ${ACCESS_TOKEN}`, 'yellow');

  // Solicitar credenciales de usuario
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  log('\nPara los tests de lectura, necesitas credenciales de usuario:', 'yellow');
  const email = await question('Email: ');
  const password = await question('Password: ');

  console.log('');

  const results = {
    connectivity: false,
    sendTelemetry: false,
    authentication: false,
    readTelemetry: false,
    deviceInfo: false
  };

  // Ejecutar tests
  results.connectivity = await testConnectivity();
  await sleep(1000);

  results.sendTelemetry = await testSendTelemetry();
  await sleep(1000);

  let jwt = null;
  if (email && password) {
    jwt = await testAuthentication(email, password);
    results.authentication = !!jwt;
    await sleep(1000);

    if (jwt) {
      results.readTelemetry = await testReadTelemetry(jwt);
      await sleep(1000);

      results.deviceInfo = await testDeviceInfo(jwt);
      await sleep(1000);
    }
  } else {
    log('\n⚠ Tests de autenticación omitidos (no se proporcionaron credenciales)', 'yellow');
  }

  // Resumen
  header('RESUMEN DE RESULTADOS');

  log(`Conectividad:           ${results.connectivity ? '✓ PASS' : '✗ FAIL'}`, results.connectivity ? 'green' : 'red');
  log(`Enviar Telemetría:      ${results.sendTelemetry ? '✓ PASS' : '✗ FAIL'}`, results.sendTelemetry ? 'green' : 'red');
  log(`Autenticación:          ${results.authentication ? '✓ PASS' : '⊘ SKIP'}`, results.authentication ? 'green' : 'yellow');
  log(`Leer Telemetría:        ${results.readTelemetry ? '✓ PASS' : '⊘ SKIP'}`, results.readTelemetry ? 'green' : 'yellow');
  log(`Info del Dispositivo:   ${results.deviceInfo ? '✓ PASS' : '⊘ SKIP'}`, results.deviceInfo ? 'green' : 'yellow');

  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.values(results).length;

  console.log('\n' + '='.repeat(60));
  log(`\nResultado Final: ${passedTests}/${totalTests} tests exitosos\n`, passedTests === totalTests ? 'green' : 'yellow');

  if (results.connectivity && results.sendTelemetry) {
    log('✅ El dispositivo IoT está funcionando correctamente', 'green');
  } else {
    log('⚠️ Hay problemas con la conexión del dispositivo IoT', 'yellow');
  }

  if (jwt && results.readTelemetry) {
    log('✅ La aplicación TrueFocus puede leer los datos del sensor', 'green');
  } else if (!jwt) {
    log('ℹ️ Ejecuta nuevamente con credenciales para probar lectura de datos', 'blue');
  }

  rl.close();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
runTests().catch(error => {
  log('\n✗ Error fatal:', 'red');
  console.error(error);
  process.exit(1);
});
