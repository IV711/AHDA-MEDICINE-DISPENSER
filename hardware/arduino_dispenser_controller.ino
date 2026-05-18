#include <Servo.h>

// Single servo pin
const int DISPENSE_SERVO_PIN = 5;

const int ULTRASONIC_TRIG_PIN = 10;
const int ULTRASONIC_ECHO_PIN = 11;

Servo dispenseServo;

const int SERVO_HOME_ANGLE = 0;
const int SERVO_DISPENSE_ANGLE = 90;
const int DISPENSE_DELAY_MS = 500;

void setup() {
  Serial.begin(9600);

  dispenseServo.attach(DISPENSE_SERVO_PIN);
  dispenseServo.write(SERVO_HOME_ANGLE);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  Serial.println("READY:AHDA_DISPENSER");
}

void loop() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    handleCommand(command);
  }
}

void handleCommand(const String &command) {

  if (command == "PING") {
    Serial.println("PONG");
    return;
  }

  if (command == "STATUS") {
    float distance = readDistanceCm();
    Serial.print("STATUS:DISTANCE_CM:");
    Serial.println(distance);
    return;
  }

  if (command == "DISPENSE:MORNING") {
    dispense("MORNING");
    return;
  }

  if (command == "DISPENSE:AFTERNOON") {
    dispense("AFTERNOON");
    return;
  }

  if (command == "DISPENSE:NIGHT") {
    dispense("NIGHT");
    return;
  }

  Serial.print("ERR:UNKNOWN_COMMAND:");
  Serial.println(command);
}

void dispense(const char *slotName) {

  float cupDistance = readDistanceCm();

  // Safety check (optional)
  if (false) {
    Serial.print("ERR:NO_CUP:");
    Serial.println(slotName);
    return;
  }

  dispenseServo.write(SERVO_DISPENSE_ANGLE);
  delay(DISPENSE_DELAY_MS);
  dispenseServo.write(SERVO_HOME_ANGLE);

  Serial.print("OK:DISPENSE:");
  Serial.println(slotName);
}

float readDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1;
  }

  return duration * 0.0343 / 2.0;
}