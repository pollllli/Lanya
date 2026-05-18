import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import StorageService from '../services/StorageService';

const ScanScreen = ({ navigation, route }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const scanningRef = useRef(true);
  const currentLitPosition = useRef(null);

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const sendLightCommand = async (type, position) => {
    if (!global.deviceConnection || !global.deviceConnection.handler) return;
    try {
      await global.deviceConnection.handler.sendCommand({ type, lightId: position });
    } catch (error) {
      console.log('灯光指令发送失败:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (currentLitPosition.current !== null) {
        sendLightCommand('lightOff', currentLitPosition.current);
      }
    };
  }, []);

  const findFirstEmptyPosition = async () => {
    const devices = await StorageService.getDevices();
    const occupiedPositions = new Set();
    devices.forEach(d => {
      if (d.shelfId === '1' && d.location) {
        const pos = parseInt(d.location, 10);
        if (!isNaN(pos)) {
          occupiedPositions.add(pos);
        }
      }
    });
    for (let i = 1; i <= 100; i++) {
      if (!occupiedPositions.has(i)) {
        return i;
      }
    }
    return null;
  };

  const parseQRCode = (data) => {
    try {
      const result = {};
      const pairs = data.split(',');
      pairs.forEach(pair => {
        const colonIndex = pair.indexOf(':');
        if (colonIndex > 0) {
          const key = pair.substring(0, colonIndex).trim();
          const value = pair.substring(colonIndex + 1).trim();
          result[key] = value;
        }
      });
      return result;
    } catch (error) {
      return {};
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (!scanningRef.current) return;
    scanningRef.current = false;

    const parsed = parseQRCode(data);
    const supplierId = parsed.pc || '';
    const deviceName = parsed.pm || '';

    if (!supplierId) {
      showToast('未识别到供应商编号');
      setTimeout(() => { scanningRef.current = true; }, 1500);
      return;
    }

    try {
      const existingDevices = await StorageService.getDevices();
      const duplicate = existingDevices.find(d => d.supplierId === supplierId);
      if (duplicate) {
        showToast(`供应商编号 ${supplierId} 已存在，位置 ${duplicate.location || '未分配'}`);
      setTimeout(() => { scanningRef.current = true; }, 1500);
      return;
      }

      const emptyPosition = await findFirstEmptyPosition();
      if (emptyPosition === null) {
        showToast('器件架已满，没有空位置');
        setTimeout(() => { scanningRef.current = true; }, 1500);
        return;
      }

      const newDevice = {
        name: deviceName || '',
        supplierId: supplierId,
        package: '',
        position: '',
        category: '',
        function: '',
        value: '',
        resistance: '',
        voltage: '',
        capacitance: '',
        inductance: '',
        current: '',
        power: '',
        frequency: '',
        shelfId: '1',
        location: String(emptyPosition),
      };

      await StorageService.addDevice(newDevice);

      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await sendLightCommand('lightOn', emptyPosition);
      currentLitPosition.current = emptyPosition;

      const displayName = deviceName || supplierId;
      showToast(`保存器件 ${displayName} 到位置 ${emptyPosition}`);
    } catch (error) {
      showToast('保存失败');
    }

    setTimeout(() => {
      scanningRef.current = true;
    }, 1500);
  };

  const handleCancel = () => {
    if (currentLitPosition.current !== null) {
      sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
    navigation.navigate('MainTabs', { screen: 'DeviceListTab' });
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>请求相机权限...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>需要相机权限才能扫码</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>授权</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelPermissionButton} onPress={handleCancel}>
          <Text style={styles.cancelPermissionButtonText}>取消</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_e', 'itf14'],
        }}
      />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.scanTitle}>扫码导入器件</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.scanFrame}>
        <View style={styles.frameCornerTopLeft} />
        <View style={styles.frameCornerTopRight} />
        <View style={styles.frameCornerBottomLeft} />
        <View style={styles.frameCornerBottomRight} />
        <Text style={styles.scanHint}>将二维码/条形码对准扫描框</Text>
      </View>

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelPermissionButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelPermissionButtonText: {
    color: '#999',
    fontSize: 16,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  scanTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  scanFrame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    right: '15%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  frameCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#00ff00',
  },
  scanHint: {
    position: 'absolute',
    bottom: -40,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 8,
  },
  toast: {
    position: 'absolute',
    bottom: 120,
    left: '10%',
    right: '10%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    zIndex: 200,
  },
  toastText: {
    color: '#4caf50',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ScanScreen;