#include <Servo.h>

// Servo assignment: adjust after wiring.
const int MORNING_SERVO_PIN = 3;
const int AFTERNOON_SERVO_PIN = 5;
const int NIGHT_SERVO_PIN = 6;
const int GATE_SERVO_PIN = 9;

const int ULTRASONIC_TRIG_PIN = 10;
const int ULTRASONIC_ECHO_PIN = 11;

Servo morningServo;
Servo afternoonServo;
Servo nightServo;
Servo gateServo;

const int SERVO_HOME_ANGLE = 0;
const int SERVO_DISPENSE_ANGLE = 90;
const int DISPENSE_DELAY_MS = 500;

void setup()
{
    Serial.begin(9600);

    morningServo.attach(MORNING_SERVO_PIN);
    afternoonServo.attach(AFTERNOON_SERVO_PIN);
    nightServo.attach(NIGHT_SERVO_PIN);
    gateServo.attach(GATE_SERVO_PIN);

    morningServo.write(SERVO_HOME_ANGLE);
    afternoonServo.write(SERVO_HOME_ANGLE);
    nightServo.write(SERVO_HOME_ANGLE);
    gateServo.write(SERVO_HOME_ANGLE);

    pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
    pinMode(ULTRASONIC_ECHO_PIN, INPUT);

    Serial.println("READY:AHDA_DISPENSER");
}

void loop()
{
    if (Serial.available())
    {
        String command = Serial.readStringUntil('\n');
        command.trim();
        handleCommand(command);
    }
}

void handleCommand(const String &command)
{
    if (command == "PING")
    {
        Serial.println("PONG");
        return;
    }

    if (command == "STATUS")
    {
        float distance = readDistanceCm();
        Serial.print("STATUS:DISTANCE_CM:");
        Serial.println(distance);
        return;
    }

    if (command == "DISPENSE:MORNING")
    {
        dispenseFrom(morningServo, "MORNING");
        return;
    }

    if (command == "DISPENSE:AFTERNOON")
    {
        dispenseFrom(afternoonServo, "AFTERNOON");
        return;
    }

    if (command == "DISPENSE:NIGHT")
    {
        dispenseFrom(nightServo, "NIGHT");
        return;
    }

    if (command == "GATE:OPEN")
    {
        gateServo.write(SERVO_DISPENSE_ANGLE);
        Serial.println("OK:GATE:OPEN");
        return;
    }

    if (command == "GATE:CLOSE")
    {
        gateServo.write(SERVO_HOME_ANGLE);
        Serial.println("OK:GATE:CLOSE");
        return;
    }

    Serial.print("ERR:UNKNOWN_COMMAND:");
    Serial.println(command);
}

void dispenseFrom(Servo &targetServo, const char *slotName)
{
    float cupDistance = readDistanceCm();

    // Safety lock: do not dispense if cup is missing.
    if (cupDistance <= 0 || cupDistance > 20)
    {
        Serial.print("ERR:NO_CUP:");
        Serial.println(slotName);
        return;
    }

    targetServo.write(SERVO_DISPENSE_ANGLE);
    delay(DISPENSE_DELAY_MS);
    targetServo.write(SERVO_HOME_ANGLE);

    Serial.print("OK:DISPENSE:");
    Serial.println(slotName);
}

float readDistanceCm()
{
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

    long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000);
    if (duration == 0)
    {
        return -1;
    }

    return duration * 0.0343 / 2.0;
}
