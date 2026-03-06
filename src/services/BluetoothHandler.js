import { Platform } from 'react-native';
import CommandBuilder from './CommandBuilder';

// 为React Native环境添加Base64编码/解码支持
if (typeof btoa === 'undefined') {
  global.btoa = function(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let result = '';
    let i = 0;
    for (; i < str.length; i += 3) {
      const a = str.charCodeAt(i) || 0;
      const b = str.charCodeAt(i + 1) || 0;
      const c = str.charCodeAt(i + 2) || 0;
      result += chars[a >> 2];
      result += chars[((a & 3) << 4) | (b >> 4)];
      result += chars[((b & 15) << 2) | (c >> 6)];
      result += chars[c & 63];
    }
    const padding = str.length % 3;
    return padding ? result.slice(0, padding - 3) + '==='.slice(padding) : result;
  };
}

if (typeof atob === 'undefined') {
  global.atob = function(b64Encoded) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let result = '';
    let i = 0;
    b64Encoded = b64Encoded.replace(/[^A-Za-z0-9+/=]/g, '');
    for (; i < b64Encoded.length;) {
      const a = chars.indexOf(b64Encoded.charAt(i++));
      const b = chars.indexOf(b64Encoded.charAt(i++));
      const c = chars.indexOf(b64Encoded.charAt(i++));
      const d = chars.indexOf(b64Encoded.charAt(i++));
      result += String.fromCharCode((a << 2) | (b >> 4));
      if (c !== 64) result += String.fromCharCode(((b & 15) << 4) | (c >> 2));
      if (d !== 64) result += String.fromCharCode(((c & 3) << 6) | d);
    }
    return result;
  };
}

// 条件导入 BleManager，仅在非 Web 平台使用
let BleManager, ScanMode;
if (Platform.OS !== 'web') {
  const blePlx = require('react-native-ble-plx');
  BleManager = blePlx.BleManager;
  ScanMode = blePlx.ScanMode;
}

class BluetoothHandler {
  constructor() {
    this.commandBuilder = new CommandBuilder();
    this.connectedDevice = null;
    this.manager = null;
    this.isScanning = false;
    this.isInitialized = false;
    // 对于CH9140BLE2U设备，使用已知的服务和特征UUID
    this.serviceUUID = '0000fff0-0000-1000-8000-00805f9b34fb'; // 小写UUID
    this.writeCharacteristicUUID = '0000fff1-0000-1000-8000-00805f9b34fb'; // FFF1是写入特征
    this.readCharacteristicUUID = '0000fff2-0000-1000-8000-00805f9b34fb'; // FFF2是读取特征
    console.log('=== 蓝牙处理器初始化 ===');
    console.log('服务UUID:', this.serviceUUID);
    console.log('写入特征UUID:', this.writeCharacteristicUUID);
    console.log('读取特征UUID:', this.readCharacteristicUUID);
  }

  async initialize() {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        this.isInitialized = false;
        return { success: false, message: 'Web平台不支持蓝牙功能' };
      }
      
      this.manager = new BleManager();
      // 移除isBluetoothEnabled检查，因为在新版本的react-native-ble-plx中这个方法不存在
      // 蓝牙状态检查会在扫描时自动处理
      this.isInitialized = true;
      console.log('蓝牙初始化成功');
      return { success: true, message: '蓝牙初始化成功' };
    } catch (error) {
      console.error('蓝牙初始化失败:', error);
      this.isInitialized = false;
      return { success: false, message: '蓝牙初始化失败' };
    }
  }

  async scanForDevices() {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return [];
      }
      
      if (!this.isInitialized || !this.manager) {
        throw new Error('蓝牙管理器未初始化');
      }
      this.isScanning = true;
      console.log('开始扫描蓝牙设备');
      return new Promise((resolve, reject) => {
        const devices = [];
        const scanTimeout = setTimeout(() => {
          this.manager.stopDeviceScan();
          this.isScanning = false;
          console.log('扫描超时，返回设备列表:', devices);
          resolve(devices);
        }, 10000);
        this.manager.startDeviceScan(
          null,
          { scanMode: ScanMode.LowLatency },
          (error, device) => {
            if (error) {
              console.error('扫描错误:', error);
              clearTimeout(scanTimeout);
              this.manager.stopDeviceScan();
              this.isScanning = false;
              reject(error);
              return;
            }
            if (device.name && !devices.some(d => d.id === device.id)) {
              devices.push({
                id: device.id,
                name: device.name,
                rssi: device.rssi
              });
              console.log('发现设备:', device.name, device.id, device.rssi);
            }
          }
        );
      });
    } catch (error) {
      console.error('扫描设备失败:', error);
      this.isScanning = false;
      throw error;
    }
  }

  async connectToDevice(deviceId) {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        throw new Error('Web平台不支持蓝牙功能');
      }
      
      if (!this.isInitialized || !this.manager) {
        throw new Error('蓝牙管理器未初始化');
      }
      console.log('=== 开始连接设备 ===');
      console.log('设备ID:', deviceId);
      
      const device = await this.manager.connectToDevice(deviceId);
      console.log('设备连接成功:', device.name);
      
      await device.discoverAllServicesAndCharacteristics();
      console.log('服务和特征发现成功');
      
      this.connectedDevice = device;
      console.log('设备保存成功');
      
      // 发现并打印所有服务和特征
      await this.discoverServicesAndCharacteristics(device);
      
      console.log('=== 设备连接完成 ===');
      return { success: true, message: '设备连接成功' };
    } catch (error) {
      console.error('=== 连接设备失败 ===');
      console.error('错误详情:', error);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  // 发现并打印所有服务和特征
  async discoverServicesAndCharacteristics(device) {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return;
      }
      
      console.log('=== 开始详细发现服务和特征 ===');
      const services = await device.services();
      console.log('发现的服务数量:', services.length);
      
      // 寻找可写的特征
      let foundWritableCharacteristic = null;
      let foundReadableCharacteristic = null;
      
      for (const service of services) {
        console.log('\n服务UUID:', service.uuid);
        console.log('服务对象:', service);
        const characteristics = await service.characteristics();
        console.log('  特征数量:', characteristics.length);
        
        for (const characteristic of characteristics) {
          console.log('  特征UUID:', characteristic.uuid);
          console.log('  特征对象:', characteristic);
          console.log('  可写属性:', {
            isWritableWithResponse: characteristic.isWritableWithResponse,
            isWritableWithoutResponse: characteristic.isWritableWithoutResponse
          });
          console.log('  可读属性:', characteristic.isReadable);
          console.log('  可通知属性:', characteristic.isNotifiable);
          console.log('  可指示属性:', characteristic.isIndicatable);
          
          // 寻找可写的特征
          if (!foundWritableCharacteristic && (characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse)) {
            foundWritableCharacteristic = {
              serviceUUID: service.uuid,
              characteristicUUID: characteristic.uuid,
              isWritableWithResponse: characteristic.isWritableWithResponse,
              isWritableWithoutResponse: characteristic.isWritableWithoutResponse
            };
            console.log('  找到可写特征:', foundWritableCharacteristic);
          }
          
          // 寻找可读的特征
          if (!foundReadableCharacteristic && characteristic.isReadable) {
            foundReadableCharacteristic = {
              serviceUUID: service.uuid,
              characteristicUUID: characteristic.uuid
            };
            console.log('  找到可读特征:', foundReadableCharacteristic);
          }
        }
      }
      
      // 如果找到可写特征，更新配置
      if (foundWritableCharacteristic) {
        this.serviceUUID = foundWritableCharacteristic.serviceUUID;
        this.writeCharacteristicUUID = foundWritableCharacteristic.characteristicUUID;
        console.log('=== 更新为找到的可写特征 ===');
        console.log('服务UUID:', this.serviceUUID);
        console.log('写入特征UUID:', this.writeCharacteristicUUID);
      }
      
      // 如果找到可读特征，更新配置
      if (foundReadableCharacteristic) {
        this.readCharacteristicUUID = foundReadableCharacteristic.characteristicUUID;
        console.log('=== 更新为找到的可读特征 ===');
        console.log('读取特征UUID:', this.readCharacteristicUUID);
      }
      
      console.log('=== 服务和特征发现完成 ===');
    } catch (error) {
      console.error('发现服务和特征失败:', error);
    }
  }

  async sendCommand(command) {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return {
          success: false,
          message: 'Web平台不支持蓝牙功能'
        };
      }
      
      if (!this.connectedDevice || !this.manager) {
        console.error('未连接设备');
        return {
          success: false,
          message: '未连接设备'
        };
      }
      
      const deviceId = this.connectedDevice.id;
      console.log('设备ID:', deviceId);
      console.log('命令类型:', command.type);
      
      // 检查必要的参数
      if (!deviceId || !this.serviceUUID || !this.writeCharacteristicUUID) {
        console.error('缺少必要的参数:', { deviceId, serviceUUID: this.serviceUUID, characteristicUUID: this.writeCharacteristicUUID });
        return {
          success: false,
          message: '缺少必要的参数'
        };
      }
      
      console.log('使用的UUID:', { serviceUUID: this.serviceUUID, characteristicUUID: this.writeCharacteristicUUID });
      
      // 构建命令帧
      let frame;
      if (command.type === 'lightOn') {
        frame = this.commandBuilder.buildLightOnCommand(command.lightId || 1);
      } else if (command.type === 'lightOff') {
        frame = this.commandBuilder.buildLightOffCommand(command.lightId || 1);
      } else if (command.type === 'heartbeat') {
        frame = this.commandBuilder.buildHeartbeatCommand();
      } else if (command.type === 'controlAll') {
        frame = this.commandBuilder.buildControlAllLightsCommand(command.state || true);
      } else if (command.type === 'requestDevice') {
        frame = this.commandBuilder.buildRequestDeviceCommand(command.deviceId || 1);
      } else {
        // 默认发送心跳命令
        frame = this.commandBuilder.buildHeartbeatCommand();
      }
      
      console.log('构建的命令帧:', frame);
      
      // 发送原始字节帧
      try {
        console.log('=== 开始发送命令 ===');
        console.log('设备ID:', deviceId);
        console.log('服务UUID:', this.serviceUUID);
        console.log('写入特征UUID:', this.writeCharacteristicUUID);
        console.log('命令帧:', frame);
        console.log('命令帧长度:', frame.length);
        console.log('命令帧Hex:', frame.map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // 检查设备连接状态
        try {
          // 直接使用已连接的设备对象
          const isConnected = await this.connectedDevice.isConnected();
          console.log('设备连接状态:', isConnected);
          if (!isConnected) {
            console.error('设备已断开连接');
            return {
              success: false,
              message: '设备已断开连接'
            };
          }
        } catch (error) {
          console.error('检查设备连接状态失败:', error);
        }
        
        // 获取特征对象，检查其属性
        try {
          // 直接使用已连接的设备对象
          const services = await this.connectedDevice.services();
          console.log('发现的服务数量:', services.length);
          for (const service of services) {
            console.log('服务UUID:', service.uuid);
            const characteristics = await service.characteristics();
            console.log('  特征数量:', characteristics.length);
            for (const characteristic of characteristics) {
              console.log('  特征UUID:', characteristic.uuid);
              console.log('  特征可写属性:', {
                isWritableWithResponse: characteristic.isWritableWithResponse,
                isWritableWithoutResponse: characteristic.isWritableWithoutResponse
              });
              console.log('  特征可读属性:', characteristic.isReadable);
              console.log('  特征可通知属性:', characteristic.isNotifiable);
            }
          }
          
          const service = services.find(s => s.uuid === this.serviceUUID);
          if (service) {
            const characteristics = await service.characteristics();
            const characteristic = characteristics.find(c => c.uuid === this.writeCharacteristicUUID);
            if (characteristic) {
              console.log('写入特征对象:', characteristic);
              console.log('写入特征可写属性:', {
                isWritableWithResponse: characteristic.isWritableWithResponse,
                isWritableWithoutResponse: characteristic.isWritableWithoutResponse
              });
            } else {
              console.error('未找到写入特征');
            }
          } else {
            console.error('未找到服务');
          }
        } catch (error) {
          console.error('获取特征对象失败:', error);
        }
        
        // 将命令帧转换为Base64编码
        const base64Data = this.bytesToBase64(frame);
        console.log('字节帧Base64编码:', base64Data);
        
        // 尝试使用无响应写入（大多数设备推荐）
        console.log('尝试使用无响应写入...');
        try {
          await this.manager.writeCharacteristicWithoutResponseForDevice(
            deviceId,
            this.serviceUUID,
            this.writeCharacteristicUUID,
            base64Data
          );
          console.log('无响应写入成功');
        } catch (error) {
          console.error('无响应写入失败:', error);
          // 如果无响应写入失败，尝试有响应写入
          console.log('尝试使用有响应写入...');
          try {
            await this.manager.writeCharacteristicWithResponseForDevice(
              deviceId,
              this.serviceUUID,
              this.writeCharacteristicUUID,
              base64Data
            );
            console.log('有响应写入成功');
          } catch (responseError) {
            console.error('有响应写入失败:', responseError);
            // 尝试使用设备对象直接写入
            console.log('尝试使用设备对象直接写入...');
            try {
              // 直接使用已连接的设备对象
              const services = await this.connectedDevice.services();
              const service = services.find(s => s.uuid === this.serviceUUID);
              if (service) {
                const characteristics = await service.characteristics();
                const characteristic = characteristics.find(c => c.uuid === this.writeCharacteristicUUID);
                if (characteristic) {
                  if (characteristic.isWritableWithoutResponse) {
                    await characteristic.writeWithoutResponse(base64Data);
                    console.log('设备对象无响应写入成功');
                  } else if (characteristic.isWritableWithResponse) {
                    await characteristic.writeWithResponse(base64Data);
                    console.log('设备对象有响应写入成功');
                  } else {
                    throw new Error('特征不可写');
                  }
                } else {
                  throw new Error('未找到写入特征');
                }
              } else {
                throw new Error('未找到服务');
              }
            } catch (directError) {
              console.error('设备对象直接写入失败:', directError);
              throw directError;
            }
          }
        }
        
        console.log('发送命令成功');
        console.log('=== 发送命令完成 ===');
        return {
          cmd: frame[2] | 0x80, // 响应命令字 = 原命令字 | 0x80
          data: [0x01],
          success: true
        };
      } catch (error) {
        console.error('=== 发送命令失败 ===');
        console.error('错误详情:', error);
        console.error('错误消息:', error.message);
        console.error('错误堆栈:', error.stack);
        return {
          success: false,
          message: error.message || '发送命令失败'
        };
      }
    } catch (error) {
      console.error('发送命令失败:', error);
      console.error('错误详情:', error.message, error.stack);
      // 返回失败响应，而不是抛出异常，避免应用闪退
      return {
        success: false,
        message: error.message || '发送命令失败'
      };
    }
  }

  async disconnect() {
    try {
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        this.connectedDevice = null;
        return;
      }
      
      if (this.connectedDevice) {
        await this.connectedDevice.cancelConnection();
        console.log('设备断开连接成功');
      }
      this.connectedDevice = null;
    } catch (error) {
      console.error('断开连接失败:', error);
      this.connectedDevice = null;
    }
  }

  // 将字节数组转换为Base64编码
  bytesToBase64(bytes) {
    // 确保所有字节都在0-255范围内
    const clampedBytes = bytes.map(byte => byte & 0xFF);
    console.log('要编码的字节数组:', clampedBytes);
    
    // 使用React Native兼容的方式将字节数组转换为Base64编码
    try {
      // 直接使用String.fromCharCode和btoa
      let binary = '';
      for (let i = 0; i < clampedBytes.length; i++) {
        binary += String.fromCharCode(clampedBytes[i]);
      }
      
      // 使用btoa转换为Base64编码
      const base64 = btoa(binary);
      console.log('Base64编码成功:', base64);
      return base64;
    } catch (error) {
      console.error('Base64编码失败:', error);
      // 如果btoa方法失败，尝试使用替代方法
      return this.simpleBytesToBase64(clampedBytes);
    }
  }

  // 简单的Base64编码方法
  simpleBytesToBase64(bytes) {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < bytes.length) {
      // 取三个字节
      const b1 = bytes[i++] & 0xFF;
      const b2 = i < bytes.length ? bytes[i++] & 0xFF : 0;
      const b3 = i < bytes.length ? bytes[i++] & 0xFF : 0;
      
      // 计算四个Base64字符
      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 0x03) << 4) | (b2 >> 4);
      const enc3 = ((b2 & 0x0F) << 2) | (b3 >> 6);
      const enc4 = b3 & 0x3F;
      
      // 添加到结果
      result += base64Chars[enc1];
      result += base64Chars[enc2];
      result += i > bytes.length + 1 ? '=' : base64Chars[enc3];
      result += i > bytes.length ? '=' : base64Chars[enc4];
    }
    
    console.log('简单Base64编码成功:', result);
    return result;
  }

  // 将Base64编码转换为字节数组
  base64ToBytes(base64) {
    // 使用atob将Base64编码转换为字符串
    const binary = atob(base64);
    // 创建字节数组
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export default BluetoothHandler;