class CommandBuilder {
  // CRC8校验计算（MAXIM算法）
  calculateCRC8(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x80) {
          crc = (crc << 1) ^ 0x31; // MAXIM多项式: x8+x5+x4+1
        } else {
          crc <<= 1;
        }
        crc &= 0xFF;
      }
    }
    return crc;
  }

  // 构建命令帧
  buildCommandFrame(cmd, data = []) {
    // 帧头
    const header = [0x55, 0xAA];
    // 命令字
    const commandWord = cmd;
    // 数据长度
    const dataLength = data.length;
    // 构建帧
    let frame = [...header, commandWord, dataLength, ...data];
    // 计算CRC8校验
    const crc = this.calculateCRC8(frame);
    // 添加CRC
    frame = [...frame, crc];
    // 确保帧长度为6字节（12个十六进制数字）
    while (frame.length < 6) {
      frame.push(0x00);
    }
    // 截断到6字节（确保不超过）
    frame = frame.slice(0, 6);
    // 返回完整帧
    return frame;
  }

  // 解析响应帧
  parseResponseFrame(data) {
    if (data.length < 6) {
      throw new Error('响应帧长度不足');
    }

    // 检查帧头
    if (data[0] !== 0x55 || data[1] !== 0xAA) {
      throw new Error('响应帧头错误');
    }

    // 命令字
    const cmd = data[2];
    // 数据长度
    const dataLength = data[3];
    // 数据
    const responseData = data.slice(4, 4 + dataLength);
    // 校验
    const crc = data[4 + dataLength];

    // 验证校验
    const frameToCheck = data.slice(0, 4 + dataLength);
    const calculatedCrc = this.calculateCRC8(frameToCheck);
    if (crc !== calculatedCrc) {
      throw new Error('响应帧校验错误');
    }

    return {
      cmd,
      data: responseData,
      success: true
    };
  }

  // 构建常用命令
  buildLightOnCommand(lightId) {
    // 确保lightId是有效的字节值（0-255）
    const validLightId = parseInt(lightId) & 0xFF;
    return this.buildCommandFrame(0x01, [validLightId]);
  }

  buildLightOffCommand(lightId) {
    // 确保lightId是有效的字节值（0-255）
    const validLightId = parseInt(lightId) & 0xFF;
    return this.buildCommandFrame(0x02, [validLightId]);
  }

  buildControlAllLightsCommand(state) {
    return this.buildCommandFrame(0x03, [state ? 0xFF : 0x00]);
  }

  buildHeartbeatCommand() {
    return this.buildCommandFrame(0x00, []);
  }

  // 构建请求器件命令
  buildRequestDeviceCommand(deviceId) {
    // 确保deviceId是有效的字节值（0-255）
    const validDeviceId = parseInt(deviceId) & 0xFF;
    return this.buildCommandFrame(0x04, [validDeviceId]);
  }
}

export default CommandBuilder;