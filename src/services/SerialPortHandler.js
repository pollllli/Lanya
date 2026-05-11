/**
 * 串口处理器模块
 * 负责串口通信的管理、命令发送、数据接收和心跳检测
 * 支持模拟模式（用于开发测试）和真实串口模式
 */

import CommandBuilder from './CommandBuilder';

/**
 * 默认配置常量
 */
const DEFAULT_CONFIG = {
  PORT_PATH: '/dev/ttyUSB0', // 默认串口路径（Linux）
  BAUD_RATE: 9600, // 默认波特率
  DATA_BITS: 8, // 数据位（通常为8位）
  STOP_BITS: 1, // 停止位（通常为1位）
  PARITY: 0, // 校验位（0=无校验，1=奇校验，2=偶校验）
  MAX_RECONNECT_ATTEMPTS: 5, // 最大重连次数
  RECONNECT_DELAY: 3000, // 重连延迟（毫秒）
  HEARTBEAT_INTERVAL: 10000, // 心跳间隔（毫秒）
  DATA_RECEIVE_INTERVAL: 5000, // 模拟数据接收间隔（毫秒）
  BATCH_COMMAND_DELAY: 100, // 批量命令发送间隔（毫秒）
  MAX_BATCH_SIZE: 50, // 最大批量命令数量
};

/**
 * 模拟串口设备列表（用于开发测试）
 */
const MOCK_PORTS = [
  { id: '/dev/ttyUSB0', name: 'USB Serial Port 0' },
  { id: '/dev/ttyUSB1', name: 'USB Serial Port 1' },
  { id: '/dev/ttyS0', name: 'Serial Port 0' },
  { id: '/dev/ttyS1', name: 'Serial Port 1' },
];

/**
 * 日志级别枚举
 */
const LOG_LEVELS = {
  DEBUG: 0, // 调试信息（最详细）
  INFO: 1, // 一般信息
  WARN: 2, // 警告信息
  ERROR: 3, // 错误信息（最精简）
};

/**
 * 串口处理器类
 * 提供串口通信的完整功能，包括连接管理、命令发送、数据接收等
 */
class SerialPortHandler {
  /**
   * 构造函数
   */
  constructor() {
    this.commandBuilder = new CommandBuilder(); // 命令帧构建器实例
    this.serialPort = null; // 串口对象（真实串口库使用）
    this.portPath = DEFAULT_CONFIG.PORT_PATH; // 当前串口路径
    this.baudRate = DEFAULT_CONFIG.BAUD_RATE; // 当前波特率
    this.dataBits = DEFAULT_CONFIG.DATA_BITS; // 当前数据位
    this.stopBits = DEFAULT_CONFIG.STOP_BITS; // 当前停止位
    this.parity = DEFAULT_CONFIG.PARITY; // 当前校验位
    this.isConnected = false; // 连接状态
    this.autoReconnectEnabled = true; // 是否启用自动重连
    this.reconnectAttempts = 0; // 当前重连次数
    this.maxReconnectAttempts = DEFAULT_CONFIG.MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = DEFAULT_CONFIG.RECONNECT_DELAY;
    this.dataListeners = []; // 数据监听器列表
    this.eventListeners = {}; // 事件监听器映射
    this.heartbeatInterval = null; // 心跳定时器
    this.dataReceiveInterval = null; // 数据接收定时器
    this.lastHeartbeatTime = null; // 最后心跳时间
    this.logLevel = LOG_LEVELS.INFO; // 当前日志级别

    // 命令构建器映射
    this.commandBuilders = {
      lightOn: (cmd) =>
        this.commandBuilder.buildLightOnCommand(cmd.lightId || 1),
      lightOff: (cmd) =>
        this.commandBuilder.buildLightOffCommand(cmd.lightId || 1),
      heartbeat: () => this.commandBuilder.buildHeartbeatCommand(),
      controlAll: (cmd) =>
        this.commandBuilder.buildControlAllLightsCommand(
          cmd.state !== undefined ? cmd.state : true
        ),
    };
  }

  /**
   * 日志输出方法
   * @param {number} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} [data={}] - 附加数据
   */
  log(level, message, data = {}) {
    if (level >= this.logLevel) {
      const timestamp = new Date().toISOString();
      const levelName = Object.keys(LOG_LEVELS).find(
        (key) => LOG_LEVELS[key] === level
      );
      console[levelName.toLowerCase()](
        `[${timestamp}] [SerialPort] [${levelName}] ${message}`,
        data
      );
    }
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 监听器函数
   */
  on(event, listener) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(listener);
    this.log(LOG_LEVELS.DEBUG, `添加事件监听器: ${event}`, {
      listenerCount: this.eventListeners[event].length,
    });
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 监听器函数
   */
  off(event, listener) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(
        (l) => l !== listener
      );
      this.log(LOG_LEVELS.DEBUG, `移除事件监听器: ${event}`, {
        listenerCount: this.eventListeners[event].length,
      });
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          this.log(LOG_LEVELS.ERROR, '事件监听器执行失败', {
            event,
            error: error.message,
          });
        }
      });
    }
  }

  /**
   * 获取可用串口列表
   * @returns {Promise<Array<Object>>} 串口设备列表
   */
  async getAvailablePorts() {
    try {
      this.log(LOG_LEVELS.INFO, '获取可用串口设备');
      // 模拟返回串口列表（真实场景应调用串口库）
      return MOCK_PORTS;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '获取串口设备失败', { error: error.message });
      return [];
    }
  }

  /**
   * 初始化串口连接
   * @returns {Promise<Object>} 初始化结果
   */
  async initialize() {
    try {
      this.log(LOG_LEVELS.INFO, '开始初始化串口', {
        portPath: this.portPath,
        baudRate: this.baudRate,
      });

      // 模拟串口初始化成功（真实场景应调用串口库打开串口）
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // 启动心跳检测和数据接收模拟
      this.startHeartbeat();
      this.startDataReceiving();

      const result = {
        success: true,
        message: '串口初始化成功',
        port: this.portPath,
        baudRate: this.baudRate,
      };

      this.log(LOG_LEVELS.INFO, '串口初始化成功', result);
      this.emit('connected', result);

      return result;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '串口初始化失败', { error: error.message });

      // 自动重连逻辑
      if (
        this.autoReconnectEnabled &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        this.log(
          LOG_LEVELS.WARN,
          `尝试重连 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );

        setTimeout(() => {
          this.initialize().catch((err) => {
            this.log(LOG_LEVELS.ERROR, '重连失败', { error: err.message });
          });
        }, this.reconnectDelay);
      }

      this.emit('error', { message: '串口初始化失败', error: error.message });
      throw error;
    }
  }

  /**
   * 启动心跳检测
   */
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
          await this.initialize().catch((err) => {
            this.log(LOG_LEVELS.ERROR, '重连失败', { error: err.message });
          });
        }
      }
    }, DEFAULT_CONFIG.HEARTBEAT_INTERVAL);

    this.log(LOG_LEVELS.DEBUG, '心跳检测已启动', {
      interval: DEFAULT_CONFIG.HEARTBEAT_INTERVAL,
    });
  }

  /**
   * 停止心跳检测
   */
  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log(LOG_LEVELS.DEBUG, '心跳检测已停止');
    }
  }

  /**
   * 启动数据接收模拟
   */
  startDataReceiving() {
    this.clearDataReceiving();

    this.dataReceiveInterval = setInterval(() => {
      if (this.isConnected) {
        // 模拟从串口接收数据
        const mockData = {
          cmd: 0x82, // 模拟响应命令字
          data: [
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255),
          ],
          timestamp: new Date().toISOString(),
          type: 'data_report',
        };

        this.log(LOG_LEVELS.DEBUG, '模拟接收数据', mockData);
        this.notifyDataListeners(mockData);
        this.emit('data', mockData);
      }
    }, DEFAULT_CONFIG.DATA_RECEIVE_INTERVAL);

    this.log(LOG_LEVELS.DEBUG, '数据接收模拟已启动', {
      interval: DEFAULT_CONFIG.DATA_RECEIVE_INTERVAL,
    });
  }

  /**
   * 停止数据接收模拟
   */
  clearDataReceiving() {
    if (this.dataReceiveInterval) {
      clearInterval(this.dataReceiveInterval);
      this.dataReceiveInterval = null;
      this.log(LOG_LEVELS.DEBUG, '数据接收模拟已停止');
    }
  }

  /**
   * 发送命令到串口
   * @param {Object} command - 命令对象
   * @param {string} command.type - 命令类型（lightOn, lightOff, heartbeat, controlAll）
   * @param {number} [command.lightId] - 灯的ID（仅lightOn/lightOff命令）
   * @param {boolean} [command.state] - 状态（仅controlAll命令）
   * @returns {Promise<Object>} 响应结果
   */
  async sendCommand(command) {
    try {
      // 检查连接状态
      if (!this.isConnected) {
        const error = new Error('串口未连接');
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }

      // 检查命令格式
      if (!command || typeof command !== 'object' || !command.type) {
        const error = new Error('命令格式无效');
        this.log(LOG_LEVELS.ERROR, error.message, { command });
        throw error;
      }

      // 获取命令构建器
      const builder = this.commandBuilders[command.type];
      if (!builder) {
        const error = new Error(`未知命令类型: ${command.type}`);
        this.log(LOG_LEVELS.ERROR, error.message);
        throw error;
      }

      // 构建命令帧
      const frame = builder(command);

      this.log(LOG_LEVELS.INFO, '发送命令', { command, frame });

      // 模拟响应（真实场景应通过串口发送并等待响应）
      const mockResponse = {
        cmd: 0x81,
        data: [0x01],
        success: true,
        message: '命令执行成功',
        timestamp: new Date().toISOString(),
      };

      this.log(LOG_LEVELS.DEBUG, '接收响应', mockResponse);
      this.emit('commandSent', { command, response: mockResponse });

      return mockResponse;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '发送命令失败', {
        error: error.message,
        command,
      });
      this.emit('error', {
        message: '发送命令失败',
        error: error.message,
        command,
      });
      throw error;
    }
  }

  /**
   * 批量发送命令
   * @param {Array<Object>} commands - 命令数组
   * @returns {Promise<Object>} 批量执行结果
   */
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

      // 检查批量命令数量限制
      if (commands.length > DEFAULT_CONFIG.MAX_BATCH_SIZE) {
        this.log(LOG_LEVELS.WARN, `批量命令数量超过限制，将分批处理`, {
          actualSize: commands.length,
          maxSize: DEFAULT_CONFIG.MAX_BATCH_SIZE,
        });
      }

      this.log(LOG_LEVELS.INFO, '批量发送命令开始', { total: commands.length });

      const results = [];
      let successCount = 0;

      // 逐个发送命令
      for (const command of commands) {
        try {
          const result = await this.sendCommand(command);
          results.push({
            command: command,
            result: result,
            success: true,
          });
          successCount++;

          // 命令间隔
          await new Promise((resolve) =>
            setTimeout(resolve, DEFAULT_CONFIG.BATCH_COMMAND_DELAY)
          );
        } catch (error) {
          const errorResult = {
            command: command,
            error: error.message,
            success: false,
          };
          results.push(errorResult);
          this.log(LOG_LEVELS.WARN, '批量命令执行失败', errorResult);
        }
      }

      // 汇总结果
      const batchResult = {
        success: successCount === commands.length,
        results: results,
        total: commands.length,
        successCount: successCount,
        failureCount: commands.length - successCount,
        timestamp: new Date().toISOString(),
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

  /**
   * 断开串口连接
   */
  async disconnect() {
    try {
      this.log(LOG_LEVELS.INFO, '开始断开串口连接');

      // 停止定时器
      this.clearHeartbeat();
      this.clearDataReceiving();

      // 关闭串口（真实场景应调用串口库关闭方法）
      if (this.serialPort) {
        // await this.serialPort.close();
        this.serialPort = null;
      }

      // 重置状态
      this.isConnected = false;
      this.dataListeners = [];

      this.log(LOG_LEVELS.INFO, '串口已断开连接');
      this.emit('disconnected', { message: '串口已断开连接' });
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '断开连接失败', { error: error.message });
      this.emit('error', { message: '断开连接失败', error: error.message });
    }
  }

  /**
   * 设置串口路径
   * @param {string} path - 串口路径
   */
  setPortPath(path) {
    if (typeof path === 'string' && path.trim()) {
      this.portPath = path;
      this.log(LOG_LEVELS.INFO, '设置串口路径', { path });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的串口路径', { path });
    }
  }

  /**
   * 设置波特率
   * @param {number} baudRate - 波特率
   */
  setBaudRate(baudRate) {
    if (Number.isInteger(baudRate) && baudRate > 0) {
      this.baudRate = baudRate;
      this.log(LOG_LEVELS.INFO, '设置波特率', { baudRate });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的波特率', { baudRate });
    }
  }

  /**
   * 设置数据位
   * @param {number} dataBits - 数据位（5-8）
   */
  setDataBits(dataBits) {
    if (Number.isInteger(dataBits) && dataBits >= 5 && dataBits <= 8) {
      this.dataBits = dataBits;
      this.log(LOG_LEVELS.INFO, '设置数据位', { dataBits });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的数据位', { dataBits });
    }
  }

  /**
   * 设置停止位
   * @param {number} stopBits - 停止位（1或2）
   */
  setStopBits(stopBits) {
    if (Number.isInteger(stopBits) && (stopBits === 1 || stopBits === 2)) {
      this.stopBits = stopBits;
      this.log(LOG_LEVELS.INFO, '设置停止位', { stopBits });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的停止位', { stopBits });
    }
  }

  /**
   * 设置校验位
   * @param {number} parity - 校验位（0=无，1=奇，2=偶）
   */
  setParity(parity) {
    if (Number.isInteger(parity) && parity >= 0 && parity <= 2) {
      this.parity = parity;
      this.log(LOG_LEVELS.INFO, '设置校验位', { parity });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的校验位', { parity });
    }
  }

  /**
   * 设置自动重连
   * @param {boolean} enabled - 是否启用
   */
  setAutoReconnect(enabled) {
    this.autoReconnectEnabled = Boolean(enabled);
    this.log(LOG_LEVELS.INFO, '设置自动重连', {
      enabled: this.autoReconnectEnabled,
    });
  }

  /**
   * 设置日志级别
   * @param {number} level - 日志级别
   */
  setLogLevel(level) {
    if (Object.values(LOG_LEVELS).includes(level)) {
      this.logLevel = level;
      this.log(LOG_LEVELS.INFO, '设置日志级别', {
        level: Object.keys(LOG_LEVELS).find((key) => LOG_LEVELS[key] === level),
      });
    }
  }

  /**
   * 获取连接状态
   * @returns {Object} 连接状态信息
   */
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
      uptime: this.lastHeartbeatTime
        ? Math.floor((Date.now() - this.lastHeartbeatTime.getTime()) / 1000)
        : null,
    };

    this.log(LOG_LEVELS.DEBUG, '获取连接状态', status);
    return status;
  }

  /**
   * 添加数据监听器
   * @param {Function} listener - 监听器函数
   */
  addDataListener(listener) {
    if (typeof listener === 'function') {
      this.dataListeners.push(listener);
      this.log(LOG_LEVELS.INFO, '添加数据监听器', {
        listenerCount: this.dataListeners.length,
      });
    } else {
      this.log(LOG_LEVELS.WARN, '无效的数据监听器', {
        listenerType: typeof listener,
      });
    }
  }

  /**
   * 移除数据监听器
   * @param {Function} listener - 监听器函数
   */
  removeDataListener(listener) {
    const initialLength = this.dataListeners.length;
    this.dataListeners = this.dataListeners.filter((l) => l !== listener);
    if (this.dataListeners.length < initialLength) {
      this.log(LOG_LEVELS.INFO, '移除数据监听器', {
        listenerCount: this.dataListeners.length,
      });
    }
  }

  /**
   * 通知所有数据监听器
   * @param {*} data - 数据
   */
  notifyDataListeners(data) {
    this.dataListeners.forEach((listener, index) => {
      try {
        listener(data);
      } catch (error) {
        this.log(LOG_LEVELS.ERROR, '监听器执行失败', {
          index,
          error: error.message,
        });
      }
    });
  }

  /**
   * 发送ping命令（心跳测试）
   * @returns {Promise<Object>} ping结果
   */
  async ping() {
    try {
      this.log(LOG_LEVELS.DEBUG, '发送ping命令');
      const response = await this.sendCommand({ type: 'heartbeat' });
      return {
        success: true,
        response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, 'ping失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export default SerialPortHandler;
