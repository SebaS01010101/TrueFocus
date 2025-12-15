#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "Adafruit_VL53L0X.h"
#include <ArduinoJson.h>

const char* ssid = "Songrim";
const char* password = "AABBCCDD";
const char* mqtt_server = "iot.ceisufro.cl"; 
const int mqtt_port = 1883; 
const char* device_token = "354ee7omsirwgui3zdzx";

#define BUZZER_PIN 15

LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_VL53L0X sensor = Adafruit_VL53L0X();
WiFiClient espClient;
PubSubClient client(espClient);

String currentStatus = "IDLE"; // IDLE, RUNNING, WARNING, PAUSED
long targetTimeSec = 0;        
long startTimeMillis = 0;      
long pausedAtSec = 0;          

long lastTelem = 0;
long lastBuzzer = 0;
bool buzzerState = false;

// FILTROS DE DETECCIÓN DE PRESENCIA
#define FILTER_SIZE 3                // Reducido de 5 a 3 para respuesta más rápida
#define PRESENCE_THRESHOLD_LOW 800   // Umbral bajo (mm)
#define PRESENCE_THRESHOLD_HIGH 30   // Umbral alto (mm)
#define HYSTERESIS_MARGIN 50         // Reducido de 100 a 50mm para transiciones más rápidas
#define CONFIRM_COUNT 2              // Reducido de 3 a 2 para detección más ágil

int distanceBuffer[FILTER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;
bool currentPresence = false;
int confirmCounter = 0;
bool pendingPresenceState = false;

// Filtro de media móvil para suavizar lecturas
int getFilteredDistance(int newDistance) {
  distanceBuffer[bufferIndex] = newDistance;
  bufferIndex = (bufferIndex + 1) % FILTER_SIZE;
  
  if (!bufferFilled && bufferIndex == 0) {
    bufferFilled = true;
  }
  
  if (!bufferFilled) {
    return newDistance;
  }
  
  long sum = 0;
  for (int i = 0; i < FILTER_SIZE; i++) {
    sum += distanceBuffer[i];
  }
  return sum / FILTER_SIZE;
}

// Detectar presencia con histéresis
bool detectPresenceWithHysteresis(int filteredDistance, bool currentState) {
  if (currentState) {
    // Si hay presencia, usar umbral más alto para salir (evitar parpadeo)
    return (filteredDistance < (PRESENCE_THRESHOLD_LOW + HYSTERESIS_MARGIN) && 
            filteredDistance > (PRESENCE_THRESHOLD_HIGH - HYSTERESIS_MARGIN));
  } else {
    // Si no hay presencia, usar umbral más bajo para entrar
    return (filteredDistance < (PRESENCE_THRESHOLD_LOW - HYSTERESIS_MARGIN) && 
            filteredDistance > (PRESENCE_THRESHOLD_HIGH + HYSTERESIS_MARGIN));
  }
}

// Confirmar cambio de estado con múltiples lecturas
bool confirmStateChange(bool detectedPresence) {
  if (detectedPresence != pendingPresenceState) {
    // Nueva detección diferente, reiniciar contador
    pendingPresenceState = detectedPresence;
    confirmCounter = 1;
    return currentPresence; // Mantener estado actual
  } else {
    // Misma detección, incrementar contador
    confirmCounter++;
    if (confirmCounter >= CONFIRM_COUNT) {
      // Confirmado el cambio
      confirmCounter = 0;
      return detectedPresence;
    }
    return currentPresence; // Mantener estado actual hasta confirmar
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

  long elapsed = (millis() - startTimeMillis) / 1000;
  if (currentStatus == "PAUSED") elapsed = pausedAtSec; 
  
  long remaining = targetTimeSec - elapsed;
  if (remaining < 0) remaining = 0;

  int mins = remaining / 60;
  int secs = remaining % 60;
  
  String timeStr = (mins < 10 ? "0" : "") + String(mins) + ":" + (secs < 10 ? "0" : "") + String(secs);
  
  lcd.print("Modo: " + currentStatus + "   "); 
  lcd.setCursor(0, 1);
  lcd.print("Tiempo: " + timeStr + "    ");
}

void handleBuzzer() {
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
  }
}

// COMUNICACION RPC

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) message += (char)payload[i];
  
  DynamicJsonDocument doc(512);
  deserializeJson(doc, message);
  String method = doc["method"];
  JsonObject params = doc["params"];

  if (method == "setSessionState") {
    String newStatus = params["status"];
    int duration = params["duration_sec"];
    
    if (currentStatus != "RUNNING" && newStatus == "RUNNING") {
        startTimeMillis = millis(); 
        targetTimeSec = duration;
    }
    if (newStatus == "PAUSED" && currentStatus == "RUNNING") {
       pausedAtSec = (millis() - startTimeMillis) / 1000;
    }
    if (newStatus == "RUNNING" && currentStatus == "PAUSED") {
       startTimeMillis = millis() - (pausedAtSec * 1000);
    }

    currentStatus = newStatus;
    updateLCD();
  }
}

void setup_wifi() {
  delay(10);
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Conectando WiFi");
  lcd.setCursor(0,1); lcd.print(ssid);

  WiFi.begin(ssid, password);

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    lcd.setCursor(dots, 1); 
    // Animación simple de puntos
    if (dots > 15) { lcd.setCursor(0,1); lcd.print("                "); dots=0; }
    lcd.print(".");
    dots++;
  }

  lcd.clear();
  lcd.setCursor(0,0); lcd.print("WiFi OK!");
  lcd.setCursor(0,1); lcd.print(WiFi.localIP());
  delay(2000); // Pausa para verip
}

void reconnect() {
  while (!client.connected()) {
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("Conectando TB...");
    
    if (client.connect("ESP32_TF", device_token, NULL)) {
      lcd.setCursor(0,1); lcd.print("Exito! Token OK");
      delay(1000);
      
      lcd.clear();
      lcd.setCursor(0,0); lcd.print("Suscripcion RPC");
      
      if(client.subscribe("v1/devices/me/rpc/request/+")) {
         lcd.setCursor(0,1); lcd.print("RPC: OK");
      } else {
         lcd.setCursor(0,1); lcd.print("RPC: FALLO");
      }
      delay(1000);
      
    } else {
      lcd.setCursor(0,1); 
      lcd.print("Error rc="); lcd.print(client.state());
      delay(5000);
    }
  }
  lcd.clear();
}


void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  Wire.begin();
  
  lcd.init(); 
  lcd.backlight();
  lcd.setCursor(0,0);
  lcd.print("Iniciando...");

  // Inicializar buffer de filtro
  for (int i = 0; i < FILTER_SIZE; i++) {
    distanceBuffer[i] = 1200;
  }

  lcd.setCursor(0,1);
  lcd.print("Sensor ToF...");
  if (!sensor.begin()) {
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("ERROR CRITICO:");
    lcd.setCursor(0,1); lcd.print("Fallo VL53L0X");
    while(1);
  }
  lcd.print("OK");
  delay(1000);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}


void loop() {
  if (!client.connected()) {
      reconnect();
  }
  client.loop();

  handleBuzzer();
  
  static long lastLCD = 0;
  if (millis() - lastLCD > 500) {
      lastLCD = millis();
      updateLCD();
  }

  // TELEMETRIA CON FILTROS AVANZADOS
  if (millis() - lastTelem > 100) {  // Reducido de 200ms a 100ms para muestreo más frecuente
    lastTelem = millis();
    
    VL53L0X_RangingMeasurementData_t measure;
    sensor.rangingTest(&measure, false);
    
    int distance = 0;
    bool presence = false;
    bool validReading = false;

    // Verificar validez de la lectura
    if (measure.RangeStatus != 4) {
      distance = measure.RangeMilliMeter;
      validReading = true;
      
      // Aplicar filtro de media móvil
      int filteredDistance = getFilteredDistance(distance);
      
      // Detectar presencia con histéresis
      bool detectedPresence = detectPresenceWithHysteresis(filteredDistance, currentPresence);
      
      // Confirmar cambio de estado
      presence = confirmStateChange(detectedPresence);
      currentPresence = presence;
      
      // Usar distancia filtrada para telemetría
      distance = filteredDistance;
      
    } else {
      // Lectura inválida (fuera de rango)
      distance = 1200; 
      validReading = false;
      // Mantener estado de presencia anterior en caso de lectura inválida
      presence = currentPresence;
    }

    static bool lastPresence = false;
    static int lastDistance = 0;
    static long lastSent = 0;
    
    bool stateChange = (presence != lastPresence);
    bool significantChange = abs(distance - lastDistance) > 50; 
    bool heartbeat = (millis() - lastSent > 5000);

    // Enviar telemetría solo cuando haya cambios significativos
    if (stateChange || (significantChange && validReading) || heartbeat) {
        
        String payload = "{";
        payload += "\"presence\":"; 
        payload += (presence ? "true" : "false");
        payload += ",";
        payload += "\"distance\":"; 
        payload += distance;
        payload += ",";
        payload += "\"valid\":";
        payload += (validReading ? "true" : "false");
        payload += ",";
        payload += "\"confidence\":";
        payload += confirmCounter;
        payload += "}";

        if (client.publish("v1/devices/me/telemetry", (char*) payload.c_str())) {
            Serial.println("Envio OK: " + payload);
        } else {
            Serial.println("Fallo envio MQTT");
            lcd.setCursor(0,1);
            lcd.print("ERR: ENVIO FALLO"); 
            delay(500); 
        }
        
        lastPresence = presence;
        lastDistance = distance;
        lastSent = millis();
    }
  }
}