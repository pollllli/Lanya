import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  ScrollView,
  Modal
} from 'react-native';
import BluetoothHandler from '../services/BluetoothHandler';
import SerialPortHandler from '../services/SerialPortHandler';

const ConnectionScreen = ({ navigation }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [communicationType, setCommunicationType] = useState('bluetooth');
  const [bluetoothHandler, setBluetoothHandler] = useState(null);
  const [serialHandler, setSerialHandler] = useState(null);
  // 串口相关状态
  const [serialPorts, setSerialPorts] = useState([]);
  const [isScanningSerial, setIsScanningSerial] = useState(false);
  const [serialParams, setSerialParams] = useState({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 0
  });
  const [showSerialParamsModal, setShowSerialParamsModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('未连接');

  useEffect(() => {
    // 初始化通信处理器
    const initHandlers = async () => {
      try {
        // 初始化蓝牙处理器
        const bluetooth = new BluetoothHandler();
        await bluetooth.initialize();
        setBluetoothHandler(bluetooth);

        // 初始化串口处理器
        const serial = new SerialPortHandler();
        setSerialHandler(serial);

        // 检查全局连接状态
        checkGlobalConnectionStatus();
      } catch (error) {
        console.error('初始化通信处理器失败:', error);
      }
    };

    initHandlers();

    // 定期检查连接状态
    const checkInterval = setInterval(() => {
      checkGlobalConnectionStatus();
    }, 2000);

    return () => {
      // 清理资源
      clearInterval(checkInterval);
      if (bluetoothHandler) {
        bluetoothHandler.disconnect();
      }
    };
  }, []);

  // 检查全局连接状态
  const checkGlobalConnectionStatus = () => {
    if (global.deviceConnection && global.deviceConnection.device) {
      if (!isConnected) {
        console.log('检测到全局连接状态，更新界面:', global.deviceConnection);
        setIsConnected(true);
        setConnectedDevice(global.deviceConnection.device);
        if (global.deviceConnection.type === 'serial') {
          setConnectionStatus('已连接到串口设备');
        } else {
          setConnectionStatus('已连接到蓝牙设备');
        }
      }
    } else {
      if (isConnected) {
        console.log('检测到连接已断开，更新界面');
        setIsConnected(false);
        setConnectedDevice(null);
        setConnectionStatus('未连接');
      }
    }
  };

  // 扫描串口设备
  const scanForSerialPorts = async () => {
    if (!serialHandler) {
      Alert.alert('错误', '串口处理器未初始化');
      return;
    }

    setIsScanningSerial(true);
    try {
      const ports = await serialHandler.getAvailablePorts();
      setSerialPorts(ports);
      if (ports.length === 0) {
        Alert.alert('提示', '未发现串口设备');
      }
    } catch (error) {
      console.error('扫描串口设备失败:', error);
      Alert.alert('错误', `扫描串口设备失败: ${error.message}`);
    } finally {
      setIsScanningSerial(false);
    }
  };

  // 连接串口设备
  const connectToSerialPort = async (portPath) => {
    if (!serialHandler) {
      Alert.alert('错误', '串口处理器未初始化');
      return;
    }

    try {
      // 设置串口参数
      serialHandler.setPortPath(portPath);
      serialHandler.setBaudRate(serialParams.baudRate);
      serialHandler.setDataBits(serialParams.dataBits);
      serialHandler.setStopBits(serialParams.stopBits);
      serialHandler.setParity(serialParams.parity);

      // 初始化串口连接
      const result = await serialHandler.initialize();
      
      // 获取端口名称
      const port = serialPorts.find(p => p.id === portPath);
      const deviceInfo = {
        id: portPath,
        name: port ? port.name : portPath
      };

      setConnectedDevice(deviceInfo);
      setIsConnected(true);
      setConnectionStatus(`已连接到: ${deviceInfo.name}`);
      Alert.alert('成功', `已连接到串口设备: ${deviceInfo.name}`);
      
      // 保存连接状态到全局
      global.deviceConnection = {
        type: 'serial',
        device: deviceInfo,
        handler: serialHandler
      };

      // 添加数据监听器
      serialHandler.addDataListener((data) => {
        console.log('接收到串口数据:', data);
        // 可以在这里处理接收到的数据，例如更新UI
      });

    } catch (error) {
      console.error('连接串口设备失败:', error);
      Alert.alert('错误', `连接串口设备失败: ${error.message}`);
    }
  };

  // 渲染串口设备项
  const renderSerialPortItem = ({ item }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToSerialPort(item.id)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceId}>{item.id}</Text>
      </View>
    </TouchableOpacity>
  );

  // 波特率选项
  const baudRateOptions = [9600, 19200, 38400, 57600, 115200];
  
  // 数据位选项
  const dataBitsOptions = [5, 6, 7, 8];
  
  // 停止位选项
  const stopBitsOptions = [1, 2];
  
  // 校验位选项
  const parityOptions = [
    { value: 0, label: '无校验' },
    { value: 1, label: '奇校验' },
    { value: 2, label: '偶校验' }
  ];

  // 请求蓝牙权限
  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // 1. 请求位置权限
        const locationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: '位置权限',
            message: '应用需要位置权限才能扫描蓝牙设备',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        ) === PermissionsAndroid.RESULTS.GRANTED;

        // 2. 请求蓝牙扫描权限
        const scanGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: '蓝牙扫描权限',
            message: '应用需要蓝牙扫描权限才能发现附近的蓝牙设备',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        ) === PermissionsAndroid.RESULTS.GRANTED;

        // 3. 请求蓝牙连接权限
        const connectGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: '蓝牙连接权限',
            message: '应用需要蓝牙连接权限才能连接到蓝牙设备',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        ) === PermissionsAndroid.RESULTS.GRANTED;

        console.log('蓝牙权限请求结果:', { locationGranted, scanGranted, connectGranted });

        return locationGranted && scanGranted && connectGranted;
      } catch (error) {
        console.error('请求蓝牙权限失败:', error);
        return false;
      }
    } else {
      // iOS 不需要运行时权限请求
      return true;
    }
  };

  // 扫描蓝牙设备
  const scanForBluetoothDevices = async () => {
    if (!bluetoothHandler) {
      Alert.alert('错误', '蓝牙处理器未初始化');
      return;
    }

    // 请求蓝牙权限
    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) {
      Alert.alert('权限错误', '需要蓝牙权限才能扫描设备');
      return;
    }

    setIsScanning(true);
    try {
      const devices = await bluetoothHandler.scanForDevices();
      setAvailableDevices(devices);
      if (devices.length === 0) {
        Alert.alert('提示', '未发现蓝牙设备，请确保设备已开启');
      }
    } catch (error) {
      console.error('扫描蓝牙设备失败:', error);
      Alert.alert('错误', `扫描蓝牙设备失败: ${error.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 连接蓝牙设备
  const connectToBluetoothDevice = async (deviceId) => {
    if (!bluetoothHandler) {
      Alert.alert('错误', '蓝牙处理器未初始化');
      return;
    }

    try {
      await bluetoothHandler.connectToDevice(deviceId);
      const device = availableDevices.find(d => d.id === deviceId);
      setConnectedDevice(device);
      setIsConnected(true);
      Alert.alert('成功', `已连接到设备: ${device.name}`);
      
      // 保存连接状态到全局
      global.deviceConnection = {
        type: 'bluetooth',
        device: device,
        handler: bluetoothHandler
      };
    } catch (error) {
      console.error('连接蓝牙设备失败:', error);
      Alert.alert('错误', `连接蓝牙设备失败: ${error.message}`);
    }
  };

  // 断开连接
  const disconnect = async () => {
    try {
      if (communicationType === 'bluetooth' && bluetoothHandler) {
        await bluetoothHandler.disconnect();
      } else if (communicationType === 'serial' && serialHandler) {
        await serialHandler.disconnect();
      }
      setIsConnected(false);
      setConnectedDevice(null);
      delete global.deviceConnection;
      Alert.alert('成功', '已断开连接');
    } catch (error) {
      console.error('断开连接失败:', error);
      Alert.alert('错误', '断开连接失败');
    }
  };

  // 渲染设备项
  const renderDeviceItem = ({ item }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToBluetoothDevice(item.id)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceId}>{item.id}</Text>
        <Text style={styles.deviceRssi}>信号强度: {item.rssi} dBm</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>设备连接</Text>
      </View>

      {/* 通信方式选择 */}
      <View style={styles.communicationTypeContainer}>
        <TouchableOpacity
          style={[
            styles.communicationTypeButton,
            communicationType === 'bluetooth' && styles.communicationTypeButtonActive
          ]}
          onPress={() => setCommunicationType('bluetooth')}
        >
          <Text style={[
            styles.communicationTypeButtonText,
            communicationType === 'bluetooth' && styles.communicationTypeButtonTextActive
          ]}>
            蓝牙
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.communicationTypeButton,
            communicationType === 'serial' && styles.communicationTypeButtonActive
          ]}
          onPress={() => setCommunicationType('serial')}
        >
          <Text style={[
            styles.communicationTypeButtonText,
            communicationType === 'serial' && styles.communicationTypeButtonTextActive
          ]}>
            串口
          </Text>
        </TouchableOpacity>
      </View>

      {/* 连接状态 */}
      <View style={styles.connectionStatus}>
        <Text style={styles.statusText}>
          {isConnected 
            ? `已连接: ${connectedDevice?.name || '设备'}` 
            : '未连接设备'
          }
        </Text>
        {isConnected && (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={disconnect}
          >
            <Text style={styles.disconnectButtonText}>断开连接</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 蓝牙设备扫描 */}
      {communicationType === 'bluetooth' && (
        <>
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
            onPress={scanForBluetoothDevices}
            disabled={isScanning}
          >
            <Text style={styles.scanButtonText}>
              {isScanning ? '扫描中...' : '扫描蓝牙设备'}
            </Text>
          </TouchableOpacity>

          {/* 蓝牙设备列表 */}
          <FlatList
            data={availableDevices}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={renderDeviceItem}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isScanning ? '正在扫描...' : '未发现设备'}
              </Text>
            }
            style={styles.deviceList}
          />
        </>
      )}

      {/* 串口连接 */}
      {communicationType === 'serial' && (
        <>
          {/* 连接状态 */}
          <View style={styles.connectionStatus}>
            <Text style={styles.statusText}>{connectionStatus}</Text>
            {isConnected && (
              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={disconnect}
              >
                <Text style={styles.disconnectButtonText}>断开连接</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 串口参数设置 */}
          <View style={styles.serialParamsContainer}>
            <TouchableOpacity
              style={styles.paramsButton}
              onPress={() => setShowSerialParamsModal(true)}
            >
              <Text style={styles.paramsButtonText}>设置串口参数</Text>
            </TouchableOpacity>
            <View style={styles.paramsInfo}>
              <Text style={styles.paramsInfoText}>
                波特率: {serialParams.baudRate} | 数据位: {serialParams.dataBits} | 
                停止位: {serialParams.stopBits} | 校验: {parityOptions[serialParams.parity].label}
              </Text>
            </View>
          </View>

          {/* 扫描串口设备 */}
          <TouchableOpacity
            style={[styles.scanButton, isScanningSerial && styles.scanButtonDisabled]}
            onPress={scanForSerialPorts}
            disabled={isScanningSerial}
          >
            <Text style={styles.scanButtonText}>
              {isScanningSerial ? '扫描中...' : '扫描串口设备'}
            </Text>
          </TouchableOpacity>

          {/* 串口设备列表 */}
          <FlatList
            data={serialPorts}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={renderSerialPortItem}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isScanningSerial ? '正在扫描...' : '未发现串口设备'}
              </Text>
            }
            style={styles.deviceList}
          />
        </>
      )}

      {/* 串口参数设置Modal */}
      <Modal
        visible={showSerialParamsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSerialParamsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>串口参数设置</Text>
            
            {/* 波特率设置 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>波特率</Text>
              <View style={styles.optionsContainer}>
                {baudRateOptions.map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={[
                      styles.optionButton,
                      serialParams.baudRate === rate && styles.optionButtonActive
                    ]}
                    onPress={() => setSerialParams({ ...serialParams, baudRate: rate })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      serialParams.baudRate === rate && styles.optionButtonTextActive
                    ]}>
                      {rate}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 数据位设置 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>数据位</Text>
              <View style={styles.optionsContainer}>
                {dataBitsOptions.map((bits) => (
                  <TouchableOpacity
                    key={bits}
                    style={[
                      styles.optionButton,
                      serialParams.dataBits === bits && styles.optionButtonActive
                    ]}
                    onPress={() => setSerialParams({ ...serialParams, dataBits: bits })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      serialParams.dataBits === bits && styles.optionButtonTextActive
                    ]}>
                      {bits}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 停止位设置 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>停止位</Text>
              <View style={styles.optionsContainer}>
                {stopBitsOptions.map((bits) => (
                  <TouchableOpacity
                    key={bits}
                    style={[
                      styles.optionButton,
                      serialParams.stopBits === bits && styles.optionButtonActive
                    ]}
                    onPress={() => setSerialParams({ ...serialParams, stopBits: bits })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      serialParams.stopBits === bits && styles.optionButtonTextActive
                    ]}>
                      {bits}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 校验位设置 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>校验位</Text>
              <View style={styles.optionsContainer}>
                {parityOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      serialParams.parity === option.value && styles.optionButtonActive
                    ]}
                    onPress={() => setSerialParams({ ...serialParams, parity: option.value })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      serialParams.parity === option.value && styles.optionButtonTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 确认按钮 */}
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => setShowSerialParamsModal(false)}
            >
              <Text style={styles.confirmButtonText}>确认</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#1976d2',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: 'white',
  },
  communicationTypeContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  communicationTypeButton: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  communicationTypeButtonActive: {
    backgroundColor: '#1976d2',
  },
  communicationTypeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  communicationTypeButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  connectionStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  scanButtonDisabled: {
    backgroundColor: '#8e8e93',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    flex: 1,
    marginHorizontal: 20,
  },
  deviceItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  deviceId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  deviceRssi: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: '#666',
    fontSize: 16,
  },
  // 串口相关样式
  serialParamsContainer: {
    padding: 16,
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  paramsButton: {
    backgroundColor: '#1976d2',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  paramsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  paramsInfo: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  paramsInfoText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  
  // Modal相关样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalSection: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonActive: {
    backgroundColor: '#1976d2',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#333',
  },
  optionButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ConnectionScreen;