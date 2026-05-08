import CommandBuilder from './CommandBuilder';

const DEFAULT_CONFIG = {
  PORT_PATH: '/dev/ttyUSB0',
  BAUD_RATE: 9600,
  DATA_BITS: 8,
  STOP_BITS: 1,
  PARITY: 0,
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 3000,
  HEARTBEAT_INTERVAL: 10000,
  DATA_RECEIVE_INTERVAL: 5000,
  BATCH_COMMAND_DELAY: 100,
  MAX_BATCH_SIZE: 50
};

const MOCK_PORTS = [
  { id: '/dev/ttyUSB0', name: 'USB Serial Port 0' },
  { id: '/dev/ttyUSB1', name: 'USB Serial Port 1' },
  { id: '/dev/ttyS0', name: 'Serial Port 0' },
  { id: '/dev/ttyS1', name: 'Serial Port 1' }
];

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class SerialPortHandler {
  constructor() {
    this.commandBuilder = new CommandBuilder();
    this.serialPort = null;
    this.portPath = DEFAULT_CONFIG.PORT_PATH;
    this.baudRate = DEFAULT_CONFIG.BAUD_RATE;
    this.dataBits = DEFAULT_CONFIG.DATA_BITS;
    this.stopBits = DEFAULT_CONFIG.STOP_BITS;
    this.parity = DEFAULT_CONFIG.PARITY;
    this.isConnected = false;
    this.autoReconnectEnabled = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = DEFAULT_CONFIG.MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = DEFAULT_CONFIG.RECONNECT_DELAY;
    this.dataListeners = [];
    this.eventListeners = {};
    this.heartbeatInterval = null;
    this.dataReceiveInterval = null;
    this.lastHeartbeatTime = null;
    this.logLevel = LOG_LEVELS.INFO;
    
    this.commandBuilders = {
      lightOn: (cmd) => this.commandBuilder.buildLightOnCommand(cmd.lightId || 1),
      lightOff: (cmd) => this.commandBuilder.buildLightOffCommand(cmd.lightId || 1),
      heartbeat: () => this.commandBuilder.buildHeartbeatCommand(),
      controlAll: (cmd) => this.commandBuilder.buildControlAllLightsCommand(cmd.state !== undefined ? cmd.state : true)
    };
  }

  log(level, message, data = {}) {
    if (level >= this.logLevel) {
      const timestamp = new Date().toISOString();
      const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
      console[levelName.toLowerCase()](`[${timestamp}] [SerialPort] [${levelName}] ${message}`, data);
    }
  }

  on(event, listener) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(listener);
    this.log(LOG_LEVELS.DEBUG, `添加事件监听器: ${event}`, { listenerCount: this.eventListeners[event].length });
  }

  off(event, listener) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
      this.log(LOG_LEVELS.DEBUG, `移除事件监听器: ${event}`, { listenerCount: this.eventListeners[event].length });
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.log(LOG_LEVELS.ERROR, '事件监听器执行失败', { event, error: error.message });
        }
      });
    }
  }

  async getAvailablePorts() {
    try {
      this.log(LOG_LEVELS.INFO, '获取可用串口设备');
      return MOCK_PORTS;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '获取串口设备失败', { error: error.message });
      return [];
    }
  }

  async initialize() {
    try {
      this.log(LOG_LEVELS.INFO, '开始初始化串口', {
        portPath: this.portPath,
        baudRate: this.baudRate
      });
      
      // 模拟串口初始化成功
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      this.startHeartbeat();
      this.startDataReceiving();
      
      const result = {
        success: true,
        message: '串口初始化成功',
        port: this.portPath,
        baudRate: this.baudRate
      };
      
      this.log(LOG_LEVELS.INFO, '串口初始化成功', result);
      this.emit('connected', result);
      
      return result;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '串口初始化失败', { error: error.message });
      
      if (this.autoReconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.log(LOG_LEVELS.WARN, `尝试重连 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        setTimeout(() => {
          this.initialize().catch(err => {
            this.log(LOG_LEVELS.ERROR, '重连失败', { error: err.message });
          });
        }, this.reconnectDelay);
      }
      
      this.emit('error', { message: '串口初始化失败', error: error.message });
      throw error;
    }
  }

  startHeartbeat() {
    this.clearHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.isConnected) {
          await this.sendCommand({ type: 'heartbeat' });
          this.lastHeartbeatTime = new Date();
          this.log(LOG_LEVELS.DEBUG, '心跳发送成功');
        }
      } catch (error) {
        this.log(LOG_LEVELS.ERROR, '心跳发送失败', { error: error.message });
        if (this.autoReconnectEnabled) {
          this.log(LOG_LEVELS.WARN, '心跳失败，尝试重连');
          await this.initialize().catch(err => {
            this.log(LOG_LEVELS.ERROR, '重连失败', { error: err.message });
          });
        }
      }
    }, DEFAULT_CONFIG.HEARTBEAT_INTERVAL);
    
    this.log(LOG_LEVELS.DEBUG, '心跳检测已启动', { interval: DEFAULT_CONFIG.HEARTBEAT_INTERVAL });
  }

  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log(LOG_LEVELS.DEBUG, '心跳检测已停止');
    }
  }

  startDataReceiving() {
    this.clearDataReceiving();
    
    this.dataReceiveInterval = setInterval(() => {
      if (this.isConnected) {
        const mockData = {
          cmd: 0x82,
          data: [Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)],
          timestamp: new Date().toISOString(),
          type: 'data_report'
        };
        
        this.log(LOG_LEVELS.DEBUG, '模拟接收数据', mockData);
        this.notifyDataListeners(mockData);
        this.emit('data', mockData);
      }
    }, DEFAULT_CONFIG.DATA_RECEIVE_INTERVAL);
    
    this.log(LOG_LEVELS.DEBUG, '数据接收模拟已启动', { interval: DEFAULT_CONFIG.DATA_RECEIVE_INTERVAL });
  }

  clearDataReceiving() {
    if (this.dataReceiveInterval) {
      clearInterval(this.dataReceiveInterval);
      this.dataReceiveInterval = null;
      this.log(LOG_LEVELS.DEBUG, '数据接收模拟已停止');
    }
  }

  async sendCommand(command) {
    try {
      if (!this.isConnected) {
        const error = new Error('串口未连接');
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }

      if (!command || typeof command !== 'object' || !command.type) {
        const error = new Error('命令格式无效');
        this.log(LOG_LEVELS.ERROR, error.message, { command });
        throw error;
      }

      const builder = this.commandBuilders[command.type];
      if (!builder) {
        const error = new Error(`未知命令类型: ${command.type}`);
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }
      
      const frame = builder(command);
      
      this.log(LOG_LEVELS.INFO, '发送命令', { command, frame });
      
      const mockResponse = {
        cmd: 0x81,
        data: [0x01],
        success: true,
        message: '命令执行成功',
        timestamp: new Date().toISOString()
      };
      
      this.log(LOG_LEVELS.DEBUG, '接收响应', mockResponse);
      this.emit('commandSent', { command, response: mockResponse });
      
      return mockResponse;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '发送命令失败', { error: error.message, command });
      this.emit('error', { message: '发送命令失败', error: error.message, command });
      throw error;
    }
  }

  async sendBatchCommands(commands) {
    try {
      if (!this.isConnected) {
        const error = new Error('串口未连接');
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }

      if (!Array.isArray(commands) || commands.length === 0) {
        const error = new Error('命令数组为空');
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }

      if (commands.length > DEFAULT_CONFIG.MAX_BATCH_SIZE) {
        this.log(LOG_LEVELS.WARN, `批量命令数量超过限制，将分批处理`, {
          actualSize: commands.length,
          maxSize: DEFAULT_CONFIG.MAX_BATCH_SIZE
        });
      }

      this.log(LOG_LEVELS.INFO, '批量发送命令开始', { total: commands.length });
      
      const results = [];
      let successCount = 0;
      
      for (const command of commands) {
        try {
          const result = await this.sendCommand(command);
          results.push({
            command: command,
            result: result,
            success: true
          });
          successCount++;
          
          await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.BATCH_COMMAND_DELAY));
        } catch (error) {
          const errorResult = {
            command: command,
            error: error.message,
            success: false
          };
          results.push(errorResult);
          this.log(LOG_LEVELS.WARN, '批量命令执行失败', errorResult);
        }
      }
      
      const batchResult = {
        success: successCount === commands.length,
        results: results,
        total: commands.length,
        successCount: successCount,
        failureCount: commands.length - successCount,
        timestamp: new Date().toISOString()
      };
      
      this.log(LOG_LEVELS.INFO, '批量发送命令完成', batchResult);
      this.emit('batchCommandsCompleted', batchResult);
      
      return batchResult;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '批量发送命令失败', { error: error.message });
      this.emit('error', { message: '批量发送命令失败', error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      this.log(LOG_LEVELS.INFO, '开始断开串口连接');
      
      this.clearHeartbeat();
      this.clearDataReceiving();
      
      if (this.serialPort) {
        // 关闭串口（需要根据串口库进行调整）
        // await this.serialPort.close();
        this.serialPort = null;
      }
      
      this.isConnected = false;
      this.dataListeners = [];
      
      this.log(LOG_LEVELS.INFO, '串口已断开连接');
      this.emit('disconnected', { message: '串口已断开连接' });
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '断开连接失败', { error: error.message });
      this.emit('error', { message: '断开连接失败', error: error.message });
    }
  }

  setPortPath(path) {
    if (typeof path === 'string' && path.trim()) {
      this.portPath = path;
      this.log(LOG_LEVELS.INFO, '设置串口路径', { path });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的串口路径', { path });
    }
  }

  setBaudRate(baudRate) {
    if (Number.isInteger(baudRate) && baudRate > 0) {
      this.baudRate = baudRate;
      this.log(LOG_LEVELS.INFO, '设置波特率', { baudRate });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的波特率', { baudRate });
    }
  }

  setDataBits(dataBits) {
    if (Number.isInteger(dataBits) && dataBits >= 5 && dataBits <= 8) {
      this.dataBits = dataBits;
      this.log(LOG_LEVELS.INFO, '设置数据位', { dataBits });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的数据位', { dataBits });
    }
  }

  setStopBits(stopBits) {
    if (Number.isInteger(stopBits) && (stopBits === 1 || stopBits === 2)) {
      this.stopBits = stopBits;
      this.log(LOG_LEVELS.INFO, '设置停止位', { stopBits });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的停止位', { stopBits });
    }
  }

  setParity(parity) {
    if (Number.isInteger(parity) && parity >= 0 && parity <= 2) {
      this.parity = parity;
      this.log(LOG_LEVELS.INFO, '设置校验位', { parity });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的校验位', { parity });
    }
  }

  setAutoReconnect(enabled) {
    this.autoReconnectEnabled = Boolean(enabled);
    this.log(LOG_LEVELS.INFO, '设置自动重连', { enabled: this.autoReconnectEnabled });
  }

  setLogLevel(level) {
    if (Object.values(LOG_LEVELS).includes(level)) {
      this.logLevel = level;
      this.log(LOG_LEVELS.INFO, '设置日志级别', { level: Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) });
    }
  }

  getConnectionStatus() {
    const status = {
      isConnected: this.isConnected,
      portPath: this.portPath,
      baudRate: this.baudRate,
      dataBits: this.dataBits,
      stopBits: this.stopBits,
      parity: this.parity,
      lastHeartbeatTime: this.lastHeartbeatTime,
      reconnectAttempts: this.reconnectAttempts,
      autoReconnectEnabled: this.autoReconnectEnabled,
      uptime: this.lastHeartbeatTime ? Math.floor((Date.now() - this.lastHeartbeatTime.getTime()) / 1000) : null
    };
    
    this.log(LOG_LEVELS.DEBUG, '获取连接状态', status);
    return status;
  }

  addDataListener(listener) {
    if (typeof listener === 'function') {
      this.dataListeners.push(listener);
      this.log(LOG_LEVELS.INFO, '添加数据监听器', { listenerCount: this.dataListeners.length });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的数据监听器', { listenerType: typeof listener });
    }
  }

  removeDataListener(listener) {
    const initialLength = this.dataListeners.length;
    this.dataListeners = this.dataListeners.filter(l => l !== listener);
    if (this.dataListeners.length < initialLength) {
      this.log(LOG_LEVELS.INFO, '移除数据监听器', { listenerCount: this.dataListeners.length });
    }
  }

  notifyDataListeners(data) {
    this.dataListeners.forEach((listener, index) => {
      try {
        listener(data);
      } catch (error) {
        this.log(LOG_LEVELS.ERROR, '监听器执行失败', { index, error: error.message });
      }
    });
  }

  async ping() {
    try {
      this.log(LOG_LEVELS.DEBUG, '发送ping命令');
      const response = await this.sendCommand({ type: 'heartbeat' });
      return {
        success: true,
        response,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, 'ping失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default SerialPortHandler;
