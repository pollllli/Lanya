/* eslint-disable prettier/prettier */
const FRAME_HEADER_1 = 0x55;
const FRAME_HEADER_2 = 0xAA;
const FRAME_MIN_LENGTH = 6;

const COMMANDS = {
  HEARTBEAT: 0x00,
  LIGHT_ON: 0x01,
  LIGHT_OFF: 0x02,
  CONTROL_ALL_LIGHTS: 0x03,
  RESPONSE_HEARTBEAT: 0x80,
  RESPONSE_LIGHT_ON: 0x81,
  RESPONSE_LIGHT_OFF: 0x82,
  RESPONSE_CONTROL_ALL: 0x83,
};

function reverseByte(byte) {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    result = (result << 1) | ((byte >> i) & 0x01);
  }
  return result;
}

function generateCRCTable() {
  const table = new Uint8Array(256);
  const polynomial = 0x31;

  for (let i = 0; i < 256; i++) {
    let crc = reverseByte(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc << 1) ^ (crc & 0x80 ? polynomial : 0);
    }
    table[i] = reverseByte(crc & 0xFF);
  }
  return table;
}

const CRCTable = generateCRCTable();

class CommandBuilder {
  constructor() {
    this.header1 = FRAME_HEADER_1;
    this.header2 = FRAME_HEADER_2;
    this.crcTable = CRCTable;
  }

  calculateCRC8(data) {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
      crc = this.crcTable[crc ^ data[i]];
    }
    return crc;
  }

  buildFrame(command, data = []) {
    const length = data.length;
    const frame = [this.header1, this.header2, command, length, ...data];
    const crc = this.calculateCRC8(frame);
    frame.push(crc);
    return frame;
  }

  buildHeartbeatCommand() {
    const highByte = 0x00;
    const lowByte = 0x01;
    const data = [highByte, lowByte];
    const frame = this.buildFrame(COMMANDS.HEARTBEAT, data);
    return frame;
  }

  buildLightOnCommand(lightId) {
    const highByte = (lightId >> 8) & 0xFF;
    const lowByte = lightId & 0xFF;
    const data = [highByte, lowByte];
    const frame = this.buildFrame(COMMANDS.LIGHT_ON, data);
    return frame;
  }

  buildLightOffCommand(lightId) {
    const highByte = (lightId >> 8) & 0xFF;
    const lowByte = lightId & 0xFF;
    const data = [highByte, lowByte];
    const frame = this.buildFrame(COMMANDS.LIGHT_OFF, data);
    return frame;
  }

  buildControlAllLightsCommand(state) {
    const value = state ? 0xFFFF : 0x0000;
    const highByte = (value >> 8) & 0xFF;
    const lowByte = value & 0xFF;
    const data = [highByte, lowByte];
    const frame = this.buildFrame(COMMANDS.CONTROL_ALL_LIGHTS, data);
    return frame;
  }

  parseResponse(response) {
    if (!response || response.length < FRAME_MIN_LENGTH) {
      return null;
    }

    if (response[0] !== this.header1 || response[1] !== this.header2) {
      return null;
    }

    const crc = this.calculateCRC8(response.slice(0, -1));
    if (crc !== response[response.length - 1]) {
      return null;
    }

    const command = response[2];
    const length = response[3];

    if (4 + length > response.length - 1) {
      return null;
    }

    const data = response.slice(4, 4 + length);

    return {
      command: command,
      length: length,
      data: data,
      isValid: true,
    };
  }

  isValidFrame(frame) {
    if (!frame || frame.length < FRAME_MIN_LENGTH) {
      return false;
    }

    if (frame[0] !== this.header1 || frame[1] !== this.header2) {
      return false;
    }

    const crc = this.calculateCRC8(frame.slice(0, -1));
    return crc === frame[frame.length - 1];
  }

  getCommandName(command) {
    for (const [name, value] of Object.entries(COMMANDS)) {
      if (value === command) {
        return name;
      }
    }
    return 'UNKNOWN';
  }
}

export default CommandBuilder;
export { COMMANDS };
