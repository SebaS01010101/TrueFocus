#include "Adafruit_VL53L0X.h"
#include <Adafruit_BMP280.h>
#include <Adafruit_CCS811.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Wire.h>

// ── credenciales ─────────────────────────────────────────
const char *ssid = "red";
const char *password = "pass";
const char *mqtt_server = "thingsboard.ip.nip.io";
const int mqtt_port = 1883;
const char *device_token = "token";

#define BUZZER_PIN 15
#define CCS811_WAKE 4
#define CCS811_RST 2

Adafruit_CCS811 ccs;
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_VL53L0X tof;
Adafruit_BMP280 bmp;
WiFiClient espClient;
PubSubClient client(espClient);

// ── estado pomodoro ──────────────────────────────────────
String currentStatus = "IDLE";
long targetTimeSec = 0;
unsigned long startTimeMillis = 0;
long pausedAtSec = 0;
unsigned long lastRpcMs = 0;

// ── alarma sonar ─────────────────────────────────────────
bool sonarAlarma = false;
unsigned long sonarStart = 0;
unsigned long sonarDuration = 0;

// ── buzzer ───────────────────────────────────────────────
unsigned long lastBuzzer = 0;
bool buzzerState = false;

// ── LCD timer ────────────────────────────────────────────
unsigned long lastLCD = 0;

// ── timeout WARNING ──────────────────────────────────────
#define WARNING_TIMEOUT_MS 30000UL

// ── VL53 buffer ──────────────────────────────────────────
#define SAMPLE_COUNT 40
#define PRESENCE_MAX_MM 800
#define PRESENCE_MIN_MM 200

int samples[SAMPLE_COUNT];
int sampleIndex = 0;
bool samplesFull = false;

void addSample(int val) {
  samples[sampleIndex] = val;
  sampleIndex = (sampleIndex + 1) % SAMPLE_COUNT;
  if (sampleIndex == 0)
    samplesFull = true;
}

int getSampleCount() { return samplesFull ? SAMPLE_COUNT : sampleIndex; }

float calcMean() {
  int n = getSampleCount();
  if (n == 0)
    return 0;
  long sum = 0;
  for (int i = 0; i < n; i++)
    sum += samples[i];
  return (float)sum / n;
}

float calcVarianza() {
  int n = getSampleCount();
  if (n < 2)
    return 0;
  float mean = calcMean();
  float sumSq = 0;
  for (int i = 0; i < n; i++) {
    float diff = samples[i] - mean;
    sumSq += diff * diff;
  }
  return sumSq / n;
}

bool calcPresencia(float mean) {
  return (mean < PRESENCE_MAX_MM && mean > PRESENCE_MIN_MM);
}

// ── estado CCS811 ────────────────────────────────────────
uint16_t lastEco2 = 0;
uint16_t lastTvoc = 0;
bool ccsHasData = false;

unsigned long lastCcsRead = 0;
unsigned long lastSample = 0;
unsigned long lastTelem = 0;

void callback(char *topic, byte *payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++)
    message += (char)payload[i];

  StaticJsonDocument<512> doc;
  deserializeJson(doc, message);
  String method = doc["method"].as<String>();
  JsonObject params = doc["params"];

  lastRpcMs = millis();
  Serial.print("RPC: ");
  Serial.println(message);

  if (method == "setSessionState") {
    String newStatus = params["status"].as<String>();
    int duration = params["duration_sec"] | 0;

    if (currentStatus != "RUNNING" && newStatus == "RUNNING") {
      startTimeMillis = millis();
      targetTimeSec = duration;
    }
    if (newStatus == "PAUSED" && currentStatus == "RUNNING") {
      pausedAtSec = (millis() - startTimeMillis) / 1000;
    }
    if (newStatus == "RUNNING" && currentStatus == "PAUSED") {
      startTimeMillis = millis() - ((unsigned long)pausedAtSec * 1000);
    }

    currentStatus = newStatus;
    lastLCD = 0;
  }

  if (method == "sonarAlarma") {
    sonarDuration = (unsigned long)(params["duration"] | 3000);
    sonarStart = millis();
    sonarAlarma = true;
  }
}

void updateLCD() {
  lcd.setCursor(0, 0);

  if (currentStatus == "IDLE") {
    lcd.print("TrueFocus v2.0  ");
    lcd.setCursor(0, 1);
    lcd.print("Esperando App...");
    return;
  }

  unsigned long elapsed = (millis() - startTimeMillis) / 1000;
  if (currentStatus == "PAUSED")
    elapsed = pausedAtSec;

  long remaining = targetTimeSec - (long)elapsed;
  if (remaining < 0)
    remaining = 0;

  int mins = remaining / 60;
  int secs = remaining % 60;

  String timeStr = (mins < 10 ? "0" : "") + String(mins) + ":" +
                   (secs < 10 ? "0" : "") + String(secs);

  lcd.print("Modo: " + currentStatus + "   ");
  lcd.setCursor(0, 1);
  lcd.print("Tiempo: " + timeStr + "    ");
}

void handleBuzzer() {
  if (sonarAlarma) {
    if (millis() - sonarStart < sonarDuration) {
      digitalWrite(BUZZER_PIN, HIGH);
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      sonarAlarma = false;
    }
    return;
  }

  if (currentStatus == "WARNING") {
    if (millis() - lastBuzzer > 200) {
      lastBuzzer = millis();
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState);
    }
  } else if (currentStatus == "PAUSED") {
    if (millis() - lastBuzzer > 1000) {
      lastBuzzer = millis();
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState);
    }
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(CCS811_WAKE, OUTPUT);
  pinMode(CCS811_RST, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Reset HW del CCS811
  digitalWrite(CCS811_RST, LOW);
  delay(100);
  digitalWrite(CCS811_RST, HIGH);
  delay(100);
  digitalWrite(CCS811_WAKE, LOW);
  delay(100);

  Wire.begin();

  // Scan I2C
  Serial.println("Escaneando I2C...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Dispositivo en 0x");
      Serial.println(addr, HEX);
    }
  }

  // CCS811 PRIMERO
  Serial.println("Iniciando CCS811...");
  if (!ccs.begin()) {
    Serial.println("ERROR: CCS811");
    while (1)
      ;
  }
  Serial.println("CCS811 OK, esperando warm-up...");
  while (!ccs.available())
    delay(100);
  Serial.println("Listo");

  if (!ccs.readData()) {
    lastEco2 = ccs.geteCO2();
    lastTvoc = ccs.getTVOC();
    ccsHasData = true;
    Serial.print("Lectura 1: eCO2=");
    Serial.print(lastEco2);
    Serial.print(" TVOC=");
    Serial.println(lastTvoc);
  }

  // Ahora el resto
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("TrueFocus v2.0");

  if (!tof.begin(0x29, false, &Wire,
                 Adafruit_VL53L0X::VL53L0X_SENSE_LONG_RANGE)) {
    Serial.println("VL53 FAIL");
    while (1)
      ;
  }
  tof.startRangeContinuous(50);

  if (!bmp.begin(0x76)) {
    Serial.println("BMP FAIL");
    while (1)
      ;
  }

  // inicializar buffer VL53
  for (int i = 0; i < SAMPLE_COUNT; i++)
    samples[i] = 1200;

  Serial.print("WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" OK");

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  lcd.setCursor(0, 1);
  lcd.print("Listo           ");
}

void sendTelemetry() {
  float distMean = calcMean();
  float distVarianza = calcVarianza();
  bool presencia = calcPresencia(distMean);

  float temperatura = bmp.readTemperature();
  float presion = bmp.readPressure() / 100.0F;

  StaticJsonDocument<512> doc;
  doc["presencia"] = presencia;
  doc["distancia_mm"] = (int)distMean;
  doc["distancia_varianza"] = (int)distVarianza;
  doc["temperatura_c"] = round(temperatura * 10) / 10.0;
  doc["presion_hpa"] = round(presion * 10) / 10.0;
  doc["eco2_ppm"] = lastEco2;
  doc["tvoc_ppb"] = lastTvoc;
  doc["ccs_ready"] = ccsHasData;
  doc["pomodoro_status"] = currentStatus;

  String payload;
  serializeJson(doc, payload);

  if (client.publish("v1/devices/me/telemetry", payload.c_str())) {
    Serial.println("Telemetria OK: " + payload);
  } else {
    Serial.println("Fallo MQTT publish");
  }
}

void loop() {
  handleBuzzer();
  if (!client.connected()) {
    if (client.connect("ESP32_TF", device_token, NULL)) {
      Serial.println("MQTT OK");
      client.subscribe("v1/devices/me/rpc/request/+");
    } else {
      delay(2000);
      return;
    }
  }
  client.loop();

  // CCS811 cada 1s
  if (millis() - lastCcsRead > 1000) {
    lastCcsRead = millis();
    if (ccs.available()) {
      if (!ccs.readData()) {
        lastEco2 = ccs.geteCO2();
        lastTvoc = ccs.getTVOC();
        Serial.print("eCO2=");
        Serial.print(lastEco2);
        Serial.print(" TVOC=");
        Serial.println(lastTvoc);
      }
    }
  }

  // VL53 cada 200ms
  if (millis() - lastSample > 200) {
    lastSample = millis();
    if (tof.isRangeComplete()) {
      uint16_t dist = tof.readRangeResult();
      if (dist < 8190)
        addSample(dist);
    }
  }

  // Telemetría cada 10s
  if (millis() - lastTelem > 2000) {
    lastTelem = millis();
    sendTelemetry();
  }

  // LCD cada 500ms
  if (millis() - lastLCD > 500) {
    lastLCD = millis();
    updateLCD();
  }

  // timeout de seguridad para WARNING
  if (currentStatus == "WARNING" && millis() - lastRpcMs > WARNING_TIMEOUT_MS) {
    currentStatus = "IDLE";
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;
    Serial.println("WARNING timeout -> IDLE");
    lastLCD = 0;
  }
}
