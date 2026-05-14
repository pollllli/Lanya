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
} from 'react-native';
import BluetoothHandler from '../services/BluetoothHandler';
import StorageService from '../services/StorageService';

const ConnectionScreen = ({ navigation }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [bluetoothHandler, setBluetoothHandler] = useState(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('未连接');

  useEffect(() => {
    const initHandlers = async () => {
      try {
        const bluetooth = new BluetoothHandler();
        await bluetooth.initialize();
        setBluetoothHandler(bluetooth);

        checkGlobalConnectionStatus();

        await tryAutoConnect(bluetooth);
      } catch (error) {
        console.error('初始化蓝牙处理器失败:', error);
      }
    };

    initHandlers();

    const checkInterval = setInterval(() => {
      checkGlobalConnectionStatus();
    }, 2000);

    global.onBluetoothDisconnected = () => {
      console.log('ConnectionScreen收到蓝牙断开通知');
      setIsConnected(false);
      setConnectedDevice(null);
      setConnectionStatus('未连接');
    };

    return () => {
      clearInterval(checkInterval);
      if (bluetoothHandler) {
        bluetoothHandler.disconnect();
      }
      delete global.onBluetoothDisconnected;
    };
  }, []);

  const checkGlobalConnectionStatus = () => {
    if (global.deviceConnection && global.deviceConnection.device) {
      if (!isConnected) {
        console.log('检测到全局连接状态，更新界面:', global.deviceConnection);
        setIsConnected(true);
        setConnectedDevice(global.deviceConnection.device);
        setConnectionStatus('已连接到蓝牙设备');
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

  const tryAutoConnect = async (bluetooth) => {
    try {
      const lastDevice = await StorageService.getLastConnectedDevice();
      if (!lastDevice || !lastDevice.deviceId) {
        console.log('没有找到上次连接的蓝牙设备信息');
        return;
      }

      console.log('尝试自动连接上次的蓝牙设备:', lastDevice.deviceName);
      setIsAutoConnecting(true);
      setConnectionStatus('正在自动连接...');

      const result = await bluetooth.connectToDevice(lastDevice.deviceId);
      if (result.success) {
        console.log('自动连接成功:', lastDevice.deviceName);
        setIsConnected(true);
        setConnectedDevice({ id: lastDevice.deviceId, name: lastDevice.deviceName });
        setConnectionStatus('已连接到蓝牙设备');

        global.deviceConnection = {
          type: 'bluetooth',
          device: { id: lastDevice.deviceId, name: lastDevice.deviceName },
          handler: bluetooth,
        };
      }
    } catch (error) {
      console.log('自动连接失败，需要手动选择设备:', error.message);
      setConnectionStatus('自动连接失败，请手动选择');
    } finally {
      setIsAutoConnecting(false);
    }
  };

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const locationGranted =
          (await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: '位置权限',
              message: '应用需要位置权限才能扫描蓝牙设备',
              buttonNeutral: '稍后询问',
              buttonNegative: '拒绝',
              buttonPositive: '允许',
            }
          )) === PermissionsAndroid.RESULTS.GRANTED;

        const scanGranted =
          (await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            {
              title: '蓝牙扫描权限',
              message: '应用需要蓝牙扫描权限才能发现附近的蓝牙设备',
              buttonNeutral: '稍后询问',
              buttonNegative: '拒绝',
              buttonPositive: '允许',
            }
          )) === PermissionsAndroid.RESULTS.GRANTED;

        const connectGranted =
          (await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            {
              title: '蓝牙连接权限',
              message: '应用需要蓝牙连接权限才能连接到蓝牙设备',
              buttonNeutral: '稍后询问',
              buttonNegative: '拒绝',
              buttonPositive: '允许',
            }
          )) === PermissionsAndroid.RESULTS.GRANTED;

        console.log('蓝牙权限请求结果:', {
          locationGranted,
          scanGranted,
          connectGranted,
        });

        return locationGranted && scanGranted && connectGranted;
      } catch (error) {
        console.error('请求蓝牙权限失败:', error);
        return false;
      }
    } else {
      return true;
    }
  };

  const scanForBluetoothDevices = async () => {
    if (!bluetoothHandler) {
      Alert.alert('错误', '蓝牙处理器未初始化');
      return;
    }

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

  const connectToBluetoothDevice = async (deviceId) => {
    if (!bluetoothHandler) {
      Alert.alert('错误', '蓝牙处理器未初始化');
      return;
    }

    try {
      await bluetoothHandler.connectToDevice(deviceId);
      const device = availableDevices.find((d) => d.id === deviceId);
      setConnectedDevice(device);
      setIsConnected(true);
      setConnectionStatus(`已连接到: ${device.name}`);
      Alert.alert('成功', `已连接到设备: ${device.name}`);

      global.deviceConnection = {
        type: 'bluetooth',
        device: device,
        handler: bluetoothHandler,
      };
    } catch (error) {
      console.error('连接蓝牙设备失败:', error);
      Alert.alert('错误', `连接蓝牙设备失败: ${error.message}`);
    }
  };

  const disconnect = async () => {
    try {
      if (bluetoothHandler) {
        await bluetoothHandler.disconnect();
      }
      setIsConnected(false);
      setConnectedDevice(null);
      setConnectionStatus('未连接');
      delete global.deviceConnection;
      Alert.alert('成功', '已断开连接');
    } catch (error) {
      console.error('断开连接失败:', error);
      Alert.alert('错误', '断开连接失败');
    }
  };

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
        <Text style={styles.title}>蓝牙连接</Text>
      </View>

      <View style={styles.connectionStatus}>
        <View style={styles.statusRow}>
          <View style={[
            styles.statusDot,
            isConnected ? styles.statusDotConnected : styles.statusDotDisconnected
          ]} />
          <Text style={styles.statusText}>
            {isAutoConnecting
              ? '正在自动连接...'
              : isConnected
                ? `已连接: ${connectedDevice?.name || '设备'}`
                : connectionStatus}
          </Text>
        </View>
        {isConnected && (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={disconnect}
          >
            <Text style={styles.disconnectButtonText}>断开连接</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isConnected && (
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

          <FlatList
            data={availableDevices}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={renderDeviceItem}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isScanning ? '正在扫描...' : '点击上方按钮扫描蓝牙设备'}
              </Text>
            }
            style={styles.deviceList}
          />
        </>
      )}
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
  connectionStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 20,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusDotConnected: {
    backgroundColor: '#4caf50',
  },
  statusDotDisconnected: {
    backgroundColor: '#f44336',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
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
});

export default ConnectionScreen;
