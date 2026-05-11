/**
 * 蓝牙处理器模块
 * 负责蓝牙设备的扫描、连接、命令发送等功能
 * 使用 react-native-ble-plx 库进行蓝牙通信
 */
import { Platform } from 'react-native';
import CommandBuilder from './CommandBuilder';

/**
 * 全局 btoa 函数兼容处理（Web平台可能不支持）
 * 将字符串编码为 Base64
 */
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

/**
 * 全局 atob 函数兼容处理（Web平台可能不支持）
 * 将 Base64 解码为字符串
 */
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

/**
 * 蓝牙管理器和扫描模式变量声明
 * 仅在非Web平台导入 react-native-ble-plx 库
 */
let BleManager, ScanMode;
if (Platform.OS !== 'web') {
  const blePlx = require('react-native-ble-plx');
  BleManager = blePlx.BleManager;
  ScanMode = blePlx.ScanMode;
}

/**
 * 蓝牙处理器类
 * 提供蓝牙设备的扫描、连接、命令发送等功能
 */
class BluetoothHandler {
  /**
   * 构造函数
   * 初始化命令构建器、连接状态和UUID配置
   */
  constructor() {
    // 初始化命令帧构建器
    this.commandBuilder = new CommandBuilder();
    // 当前连接的设备对象
    this.connectedDevice = null;
    // 蓝牙管理器实例
    this.manager = null;
    // 是否正在扫描设备
    this.isScanning = false;
    // 蓝牙是否已初始化
    this.isInitialized = false;
    // BLE服务UUID（默认值，实际会自动发现）
    this.serviceUUID = '0000fff0-0000-1000-8000-00805f9b34fb';
    // 写入特征UUID（默认值，实际会自动发现）
    this.writeCharacteristicUUID = '0000fff1-0000-1000-8000-00805f9b34fb';
    // 读取特征UUID（默认值，实际会自动发现）
    this.readCharacteristicUUID = '0000fff2-0000-1000-8000-00805f9b34fb';
    // 最后一次心跳时间（用于检测连接状态）
    this.lastHeartbeatTime = 0;
    // 心跳超时时间（毫秒），超过此时间未通信则认为断开
    this.heartbeatTimeout = 2000; // 2秒
    
    console.log('=== 蓝牙处理器初始化 ===');
    console.log('服务UUID:', this.serviceUUID);
    console.log('写入特征UUID:', this.writeCharacteristicUUID);
    console.log('读取特征UUID:', this.readCharacteristicUUID);
    console.log('心跳超时时间:', this.heartbeatTimeout, 'ms');
  }

  /**
   * 初始化蓝牙管理器
   * @returns {Object} 初始化结果对象
   * @returns {boolean} success - 是否成功
   * @returns {string} message - 结果消息
   */
  async initialize() {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        this.isInitialized = false;
        return { success: false, message: 'Web平台不支持蓝牙功能' };
      }
      
      // 创建蓝牙管理器实例
      this.manager = new BleManager();
      this.isInitialized = true;
      console.log('蓝牙初始化成功');
      return { success: true, message: '蓝牙初始化成功' };
    } catch (error) {
      console.error('蓝牙初始化失败:', error);
      this.isInitialized = false;
      return { success: false, message: '蓝牙初始化失败' };
    }
  }

  /**
   * 扫描蓝牙设备
   * @returns {Array<Object>} 扫描到的设备列表
   * @returns {string} id - 设备ID
   * @returns {string} name - 设备名称
   * @returns {number} rssi - 信号强度
   */
  async scanForDevices() {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return [];
      }
      
      // 检查蓝牙管理器是否已初始化
      if (!this.isInitialized || !this.manager) {
        throw new Error('蓝牙管理器未初始化');
      }
      
      this.isScanning = true;
      console.log('开始扫描蓝牙设备');
      
      return new Promise((resolve, reject) => {
        const devices = [];
        // 设置10秒扫描超时
        const scanTimeout = setTimeout(() => {
          this.manager.stopDeviceScan();
          this.isScanning = false;
          console.log('扫描超时，返回设备列表:', devices);
          resolve(devices);
        }, 10000);
        
        // 开始扫描设备
        this.manager.startDeviceScan(
          null,  // 不指定服务UUID，扫描所有设备
          { scanMode: ScanMode.LowLatency },  // 低延迟扫描模式
          (error, device) => {
            if (error) {
              console.error('扫描错误:', error);
              clearTimeout(scanTimeout);
              this.manager.stopDeviceScan();
              this.isScanning = false;
              reject(error);
              return;
            }
            
            // 只添加有名称且未重复的设备
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

  /**
   * 连接到指定的蓝牙设备
   * @param {string} deviceId - 设备ID
   * @returns {Object} 连接结果对象
   * @returns {boolean} success - 是否成功
   * @returns {string} message - 结果消息
   */
  async connectToDevice(deviceId) {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        throw new Error('Web平台不支持蓝牙功能');
      }
      
      // 检查蓝牙管理器是否已初始化
      if (!this.isInitialized || !this.manager) {
        throw new Error('蓝牙管理器未初始化');
      }
      
      console.log('=== 开始连接设备 ===');
      console.log('设备ID:', deviceId);
      
      // 连接到设备
      const device = await this.manager.connectToDevice(deviceId);
      console.log('设备连接成功:', device.name);
      
      // 发现设备的所有服务和特征
      await device.discoverAllServicesAndCharacteristics();
      console.log('服务和特征发现成功');
      
      // 保存连接的设备对象
      this.connectedDevice = device;
      console.log('设备保存成功');
      
      // 添加设备断开监听器
      this.setupDisconnectionListener(device);
      
      // 详细发现服务和特征并更新UUID
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

  /**
   * 详细发现设备的服务和特征
   * 自动查找可写和可读特征，并更新UUID配置
   * @param {Object} device - 设备对象
   */
  async discoverServicesAndCharacteristics(device) {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return;
      }
      
      console.log('=== 开始详细发现服务和特征 ===');
      const services = await device.services();
      console.log('发现的服务数量:', services.length);
      
      let foundWritableCharacteristic = null;
      let foundReadableCharacteristic = null;
      
      // 遍历所有服务
      for (const service of services) {
        console.log('\n服务UUID:', service.uuid);
        console.log('服务对象:', service);
        const characteristics = await service.characteristics();
        console.log('  特征数量:', characteristics.length);
        
        // 遍历服务的所有特征
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
          
          // 查找可写特征（优先有响应写入，其次无响应写入）
          if (!foundWritableCharacteristic && (characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse)) {
            foundWritableCharacteristic = {
              serviceUUID: service.uuid,
              characteristicUUID: characteristic.uuid,
              isWritableWithResponse: characteristic.isWritableWithResponse,
              isWritableWithoutResponse: characteristic.isWritableWithoutResponse
            };
            console.log('  找到可写特征:', foundWritableCharacteristic);
          }
          
          // 查找可读特征
          if (!foundReadableCharacteristic && characteristic.isReadable) {
            foundReadableCharacteristic = {
              serviceUUID: service.uuid,
              characteristicUUID: characteristic.uuid
            };
            console.log('  找到可读特征:', foundReadableCharacteristic);
          }
        }
      }
      
      // 更新写入特征UUID
      if (foundWritableCharacteristic) {
        this.serviceUUID = foundWritableCharacteristic.serviceUUID;
        this.writeCharacteristicUUID = foundWritableCharacteristic.characteristicUUID;
        console.log('=== 更新为找到的可写特征 ===');
        console.log('服务UUID:', this.serviceUUID);
        console.log('写入特征UUID:', this.writeCharacteristicUUID);
      }
      
      // 更新读取特征UUID
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

  /**
   * 发送命令到蓝牙设备
   * @param {Object} command - 命令对象
   * @param {string} command.type - 命令类型：'lightOn', 'lightOff', 'heartbeat', 'controlAll'
   * @param {number} [command.lightId] - 灯的ID（用于lightOn/lightOff命令）
   * @param {boolean} [command.state] - 状态（用于controlAll命令，true=点亮，false=熄灭）
   * @returns {Object} 发送结果对象
   * @returns {boolean} success - 是否成功
   * @returns {string} message - 结果消息
   * @returns {number} [cmd] - 响应命令字（成功时返回）
   * @returns {Array} [data] - 响应数据（成功时返回）
   */
  async sendCommand(command) {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        return {
          success: false,
          message: 'Web平台不支持蓝牙功能'
        };
      }
      
      // 检查设备是否已连接
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
      
      // 检查必要参数
      if (!deviceId || !this.serviceUUID || !this.writeCharacteristicUUID) {
        console.error('缺少必要的参数:', { deviceId, serviceUUID: this.serviceUUID, characteristicUUID: this.writeCharacteristicUUID });
        return {
          success: false,
          message: '缺少必要的参数'
        };
      }
      
      console.log('使用的UUID:', { serviceUUID: this.serviceUUID, characteristicUUID: this.writeCharacteristicUUID });
      
      // 根据命令类型构建命令帧
      let frame;
      if (command.type === 'lightOn') {
        // 点亮指定灯
        frame = this.commandBuilder.buildLightOnCommand(command.lightId || 1);
      } else if (command.type === 'lightOff') {
        // 熄灭指定灯
        frame = this.commandBuilder.buildLightOffCommand(command.lightId || 1);
      } else if (command.type === 'heartbeat') {
        // 心跳命令
        frame = this.commandBuilder.buildHeartbeatCommand();
      } else if (command.type === 'controlAll') {
        // 控制所有灯
        frame = this.commandBuilder.buildControlAllLightsCommand(command.state !== undefined ? command.state : true);
      } else {
        // 默认发送心跳命令
        frame = this.commandBuilder.buildHeartbeatCommand();
      }
      
      console.log('构建的命令帧:', frame);
      
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
        
        // 再次发现服务和特征（确保UUID正确）
        try {
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
          
          // 查找服务和特征对象
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
        
        // 将字节数组转换为Base64编码
        const base64Data = this.bytesToBase64(frame);
        console.log('字节帧Base64编码:', base64Data);
        
        // 尝试发送命令（按优先级尝试不同的写入方式）
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
            console.log('尝试使用设备对象直接写入...');
            try {
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
        
        // 更新心跳时间
        this.updateHeartbeat();
        
        return {
          cmd: frame[2] | 0x80,  // 返回响应命令字（原命令字 | 0x80）
          data: [0x01],          // 返回成功数据
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
      return {
        success: false,
        message: error.message || '发送命令失败'
      };
    }
  }

  /**
   * 断开与蓝牙设备的连接
   */
  /**
   * 更新心跳时间（在发送命令时调用）
   * 用于检测蓝牙连接状态
   */
  updateHeartbeat() {
    this.lastHeartbeatTime = Date.now();
    console.log('心跳时间已更新:', this.lastHeartbeatTime);
  }

  /**
   * 检查心跳状态（判断是否超时）
   * @returns {boolean} - 是否在心跳超时时间内
   */
  isHeartbeatAlive() {
    const now = Date.now();
    const elapsed = now - this.lastHeartbeatTime;
    const isAlive = elapsed <= this.heartbeatTimeout;
    console.log('心跳检查 - 已过去:', elapsed, 'ms, 超时时间:', this.heartbeatTimeout, 'ms, 状态:', isAlive ? '正常' : '超时');
    return isAlive;
  }

  /**
   * 设置设备断开监听器
   * 监听蓝牙设备物理断开事件（如拔掉模块）
   * @param {Object} device - 蓝牙设备对象
   */
  setupDisconnectionListener(device) {
    if (Platform.OS === 'web') {
      return;
    }
    
    // 监听设备断开事件
    device.onDisconnected((error, disconnectedDevice) => {
      console.log('=== 检测到蓝牙设备断开 ===');
      console.log('断开的设备:', disconnectedDevice?.name);
      console.log('错误信息:', error);
      
      // 清除连接状态
      this.connectedDevice = null;
      
      // 清除全局连接状态
      if (global.deviceConnection && global.deviceConnection.handler === this) {
        delete global.deviceConnection;
        console.log('全局连接状态已清除（设备物理断开）');
        
        // 触发全局事件通知UI更新
        if (typeof global.onBluetoothDisconnected === 'function') {
          console.log('通知UI蓝牙已断开');
          global.onBluetoothDisconnected();
        }
      }
    });
  }

  /**
   * 断开与蓝牙设备的连接
   */
  async disconnect() {
    try {
      // Web平台不支持蓝牙功能
      if (Platform.OS === 'web') {
        console.log('Web平台不支持蓝牙功能');
        this.connectedDevice = null;
        return;
      }
      
      // 如果有连接的设备，取消连接
      if (this.connectedDevice) {
        await this.connectedDevice.cancelConnection();
        console.log('设备断开连接成功');
      }
      this.connectedDevice = null;
      // 清除全局连接状态，确保其他页面能正确检测到断开状态
      if (global.deviceConnection && global.deviceConnection.handler === this) {
        delete global.deviceConnection;
        console.log('全局连接状态已清除');
      }
    } catch (error) {
      console.error('断开连接失败:', error);
      this.connectedDevice = null;
      // 清除全局连接状态
      if (global.deviceConnection && global.deviceConnection.handler === this) {
        delete global.deviceConnection;
      }
    }
  }

  /**
   * 将字节数组转换为Base64编码
   * @param {Array<number>} bytes - 要编码的字节数组
   * @returns {string} Base64编码字符串
   */
  bytesToBase64(bytes) {
    // 确保每个字节都在0-255范围内
    const clampedBytes = bytes.map(byte => byte & 0xFF);
    console.log('要编码的字节数组:', clampedBytes);
    
    try {
      // 使用全局btoa函数进行编码
      let binary = '';
      for (let i = 0; i < clampedBytes.length; i++) {
        binary += String.fromCharCode(clampedBytes[i]);
      }
      
      const base64 = btoa(binary);
      console.log('Base64编码成功:', base64);
      return base64;
    } catch (error) {
      console.error('Base64编码失败:', error);
      // 如果全局btoa失败，使用自定义实现
      return this.simpleBytesToBase64(clampedBytes);
    }
  }

  /**
   * 简单的Base64编码实现（备用方案）
   * @param {Array<number>} bytes - 要编码的字节数组
   * @returns {string} Base64编码字符串
   */
  simpleBytesToBase64(bytes) {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < bytes.length) {
      const b1 = bytes[i++] & 0xFF;
      const b2 = i < bytes.length ? bytes[i++] & 0xFF : 0;
      const b3 = i < bytes.length ? bytes[i++] & 0xFF : 0;
      
      // 将3个字节编码为4个Base64字符
      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 0x03) << 4) | (b2 >> 4);
      const enc3 = ((b2 & 0x0F) << 2) | (b3 >> 6);
      const enc4 = b3 & 0x3F;
      
      result += base64Chars[enc1];
      result += base64Chars[enc2];
      result += i > bytes.length + 1 ? '=' : base64Chars[enc3];
      result += i > bytes.length ? '=' : base64Chars[enc4];
    }
    
    console.log('简单Base64编码成功:', result);
    return result;
  }

  /**
   * 将Base64编码字符串转换为字节数组
   * @param {string} base64 - Base64编码字符串
   * @returns {Uint8Array} 字节数组
   */
  base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export default BluetoothHandler;
