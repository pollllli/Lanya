import CommandBuilder from './CommandBuilder';

class SerialPortHandler {
  constructor() {
    this.commandBuilder = new CommandBuilder();
    this.serialPort = null;
    this.portPath = '/dev/ttyUSB0'; // 默认串口路径
    this.baudRate = 9600;
    this.dataBits = 8;
    this.stopBits = 1;
    this.parity = 0; // 0: 无校验, 1: 奇校验, 2: 偶校验
    this.isConnected = false;
    this.autoReconnectEnabled = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3秒
    this.dataListeners = [];
    this.heartbeatInterval = null;
    this.lastHeartbeatTime = null;
  }

  // 获取可用串口设备列表
  async getAvailablePorts() {
    try {
      // 模拟可用串口设备列表
      // 实际实现需要根据串口库进行调整
      const mockPorts = [
        { id: '/dev/ttyUSB0', name: 'USB Serial Port 0' },
        { id: '/dev/ttyUSB1', name: 'USB Serial Port 1' },
        { id: '/dev/ttyS0', name: 'Serial Port 0' },
        { id: '/dev/ttyS1', name: 'Serial Port 1' },
      ];
      
      console.log('获取可用串口设备:', mockPorts);
      return mockPorts;
    } catch (error) {
      console.error('获取串口设备失败:', error);
      return [];
    }
  }

  // 初始化串口
  async initialize() {
    try {
      // 注意：这里需要根据实际使用的串口库进行调整
      // 由于 react-native-serialport 与当前 React Native 版本不兼容
      // 这里提供一个基础实现框架，后续需要根据实际使用的库进行修改
      
      // 示例：使用 react-native-serialport 的初始化代码
      // const SerialPort = require('react-native-serialport');
      // this.serialPort = await SerialPort.open(this.portPath, {
      //   baudRate: this.baudRate,
      //   dataBits: this.dataBits,
      //   stopBits: this.stopBits,
      //   parity: this.parity
      // });
      
      // 模拟串口打开
      console.log('串口初始化成功（模拟）:', {
        portPath: this.portPath,
        baudRate: this.baudRate,
        dataBits: this.dataBits,
        stopBits: this.stopBits,
        parity: this.parity
      });
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // 启动心跳检测
      this.startHeartbeat();
      
      // 模拟数据接收
      this.simulateDataReceiving();
      
      return { 
        success: true, 
        message: '串口初始化成功',
        port: this.portPath,
        baudRate: this.baudRate
      };
    } catch (error) {
      console.error('串口初始化失败:', error);
      
      // 尝试自动重连
      if (this.autoReconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`尝试重连 ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
        setTimeout(() => this.initialize(), this.reconnectDelay);
      }
      
      throw error;
    }
  }

  // 启动心跳检测
  startHeartbeat() {
    // 清除之前的心跳
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // 每10秒发送一次心跳
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.isConnected) {
          await this.sendCommand({ type: 'heartbeat' });
          this.lastHeartbeatTime = new Date();
        }
      } catch (error) {
        console.error('心跳发送失败:', error);
        // 心跳失败，尝试重连
        if (this.autoReconnectEnabled) {
          await this.initialize();
        }
      }
    }, 10000);
  }

  // 模拟数据接收
  simulateDataReceiving() {
    // 每5秒模拟接收一次数据
    setInterval(() => {
      if (this.isConnected) {
        const mockData = {
          cmd: 0x82, // 数据上报命令字
          data: [Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)],
          timestamp: new Date().toISOString(),
          type: 'data_report'
        };
        
        console.log('模拟接收数据:', mockData);
        this.notifyDataListeners(mockData);
      }
    }, 5000);
  }

  // 发送命令
  async sendCommand(command) {
    try {
      if (!this.isConnected) {
        throw new Error('串口未连接');
      }

      // 构建命令帧
      let frame;
      if (command.type === 'lightOn') {
        frame = this.commandBuilder.buildLightOnCommand(command.lightId);
      } else if (command.type === 'lightOff') {
        frame = this.commandBuilder.buildLightOffCommand(command.lightId);
      } else if (command.type === 'heartbeat') {
        frame = this.commandBuilder.buildHeartbeatCommand();
      } else if (command.type === 'controlAll') {
        frame = this.commandBuilder.buildControlAllLightsCommand(command.state);
      } else {
        throw new Error('未知命令类型');
      }
      
      console.log('发送命令:', command);
      console.log('发送命令帧:', frame);
      
      // 模拟响应
      const mockResponse = {
        cmd: 0x81, // 响应命令字
        data: [0x01], // 响应数据
        success: true,
        message: '命令执行成功',
        timestamp: new Date().toISOString()
      };
      
      console.log('接收响应:', mockResponse);
      return mockResponse;
    } catch (error) {
      console.error('发送命令失败:', error);
      throw error;
    }
  }

  // 批量发送命令
  async sendBatchCommands(commands) {
    try {
      if (!this.isConnected) {
        throw new Error('串口未连接');
      }

      if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error('命令数组为空');
      }

      console.log('批量发送命令开始，共', commands.length, '条命令');
      
      const results = [];
      
      for (const command of commands) {
        try {
          const result = await this.sendCommand(command);
          results.push({
            command: command,
            result: result,
            success: true
          });
          
          // 命令间隔
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          results.push({
            command: command,
            error: error.message,
            success: false
          });
        }
      }
      
      console.log('批量发送命令完成:', results);
      return {
        success: results.every(item => item.success),
        results: results,
        total: commands.length,
        successCount: results.filter(item => item.success).length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('批量发送命令失败:', error);
      throw error;
    }
  }

  // 断开连接
  async disconnect() {
    try {
      // 停止心跳
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      if (this.serialPort) {
        // 关闭串口（需要根据串口库进行调整）
        // await this.serialPort.close();
        this.serialPort = null;
      }
      this.isConnected = false;
      this.dataListeners = [];
      console.log('串口已断开连接');
    } catch (error) {
      console.error('断开连接失败:', error);
    }
  }

  // 设置串口路径
  setPortPath(path) {
    this.portPath = path;
  }

  // 设置波特率
  setBaudRate(baudRate) {
    this.baudRate = baudRate;
  }

  // 设置数据位
  setDataBits(dataBits) {
    this.dataBits = dataBits;
  }

  // 设置停止位
  setStopBits(stopBits) {
    this.stopBits = stopBits;
  }

  // 设置校验位
  setParity(parity) {
    this.parity = parity;
  }

  // 设置自动重连
  setAutoReconnect(enabled) {
    this.autoReconnectEnabled = enabled;
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      portPath: this.portPath,
      baudRate: this.baudRate,
      dataBits: this.dataBits,
      stopBits: this.stopBits,
      parity: this.parity,
      lastHeartbeatTime: this.lastHeartbeatTime,
      reconnectAttempts: this.reconnectAttempts,
      autoReconnectEnabled: this.autoReconnectEnabled
    };
  }

  // 添加数据监听器
  addDataListener(listener) {
    if (typeof listener === 'function') {
      this.dataListeners.push(listener);
      console.log('添加数据监听器，当前监听器数量:', this.dataListeners.length);
    }
  }

  // 移除数据监听器
  removeDataListener(listener) {
    this.dataListeners = this.dataListeners.filter(l => l !== listener);
    console.log('移除数据监听器，当前监听器数量:', this.dataListeners.length);
  }

  // 通知数据监听器
  notifyDataListeners(data) {
    this.dataListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('监听器执行失败:', error);
      }
    });
  }
}

export default SerialPortHandler;