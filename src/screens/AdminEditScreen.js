import React, { useState, useEffect, useReducer, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';

const AdminEditScreen = ({ navigation, route }) => {
  const { device, isNew, onSave } = route.params || {};

  const initialState = {
    id: device?.id || null,
    supplierId: device?.supplierId || '',
    name: device?.name || '',
    resistance: device?.resistance || '',
    voltage: device?.voltage || '',
    capacitance: device?.capacitance || '',
    inductance: device?.inductance || '',
    current: device?.current || '',
    power: device?.power || '',
    frequency: device?.frequency || '',
    category: device?.category || '',
    package: device?.package || '',
    location: device?.location || '',
    notes: device?.notes || '',
    shelfId: device?.shelfId ? device.shelfId.toString() : '1',
    errors: {},
  };

  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_FIELD':
        return {
          ...state,
          [action.payload.field]: action.payload.value,
          errors: {
            ...state.errors,
            [action.payload.field]: '',
          },
        };
      case 'SET_ERRORS':
        return {
          ...state,
          errors: action.payload,
        };
      case 'RESET':
        return initialState;
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [allDevices, setAllDevices] = useState([]);
  const currentLitPosition = useRef(null);

  const sendLightCommand = async (type, position) => {
    if (!global.deviceConnection || !global.deviceConnection.handler) return;
    try {
      await global.deviceConnection.handler.sendCommand({ type, lightId: position });
    } catch (error) {
      console.log('灯光指令发送失败:', error);
    }
  };

  const turnOffCurrentLight = async () => {
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      const loadAllDevices = async () => {
        const devices = await StorageService.getDevices();
        setAllDevices(devices);
      };
      loadAllDevices();
      return () => {
        turnOffCurrentLight();
      };
    }, [])
  );

  const getOccupiedPositions = () => {
    const occupied = new Map();
    allDevices
      .filter((d) => d.shelfId === '1' && d.location && d.id !== state.id)
      .forEach((d) => {
        const pos = parseInt(d.location, 10);
        if (!isNaN(pos)) {
          occupied.set(pos, d.name || '未知');
        }
      });
    return occupied;
  };

  const getAllPositions = () => {
    const occupied = getOccupiedPositions();
    const positions = [];
    for (let i = 1; i <= 100; i++) {
      positions.push({
        position: i,
        isOccupied: occupied.has(i),
        deviceName: occupied.get(i) || '',
      });
    }
    return positions;
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;

      const cacheDir = FileSystem.cacheDirectory;
      const localUri = cacheDir + fileName;

      await FileSystem.copyAsync({
        from: fileUri,
        to: localUri,
      });

      const fileContent = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      });

      const binaryString = atob(fileContent);
      const workbook = XLSX.read(binaryString, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        Alert.alert('错误', '文件中没有数据，请检查文件内容');
        setIsImporting(false);
        return;
      }

      const csvContent = XLSX.utils.sheet_to_csv(worksheet);

      const importResult =
        await StorageService.importDevicesFromCSV(csvContent);

      if (importResult.success) {
        let message = `成功导入 ${importResult.imported} 个器件`;
        if (importResult.errors && importResult.errors.length > 0) {
          message += `\n\n有 ${importResult.errors.length} 个错误:`;
          importResult.errors.forEach((error) => {
            message += `\n- ${error}`;
          });
        }
        Alert.alert('导入结果', message);
        navigation.goBack();
      } else {
        Alert.alert(
          '错误',
          importResult.errors && importResult.errors.length > 0
            ? importResult.errors.join('\n')
            : '导入失败，请检查文件格式'
        );
      }
    } catch (error) {
      logError('导入失败', error, 'AdminEditScreen.handleImport');
      Alert.alert('错误', `导入失败: ${error.message || '请重试'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!state.name.trim()) {
      errors.name = '请输入器件名称';
    }

    if (
      state.resistance.trim() &&
      !/^\d+(\.\d+)?[mμµukMGT]?[ΩR]?$/.test(state.resistance.trim())
    ) {
      errors.resistance = '电阻格式不正确，例如：10Ω, 1kΩ, 4.7R';
    }

    if (
      state.voltage.trim() &&
      !/^\d+(\.\d+)?[mμµukMGT]?V$/i.test(state.voltage.trim())
    ) {
      errors.voltage = '电压格式不正确，例如：5V, 12V, 3.3mV';
    }

    if (
      state.capacitance.trim() &&
      !/^\d+(\.\d+)?[pμµunm]?F?$/i.test(state.capacitance.trim())
    ) {
      errors.capacitance = '电容格式不正确，例如：10μF, 1nF, 10uF';
    }

    if (
      state.inductance.trim() &&
      !/^\d+(\.\d+)?[nμµum]?H$/i.test(state.inductance.trim())
    ) {
      errors.inductance = '电感格式不正确，例如：10mH, 1μH, 10uH';
    }

    if (
      state.current.trim() &&
      !/^\d+(\.\d+)?[nμµumk]?A$/i.test(state.current.trim())
    ) {
      errors.current = '电流格式不正确，例如：1A, 500mA, 500uA';
    }

    if (
      state.power.trim() &&
      !/^\d+(\.\d+)?[mμµuk]?W$/i.test(state.power.trim())
    ) {
      errors.power = '功率格式不正确，例如：1W, 500mW';
    }

    if (
      state.frequency.trim() &&
      !/^\d+(\.\d+)?[mμµukMGT]?Hz$/i.test(state.frequency.trim())
    ) {
      errors.frequency = '频率格式不正确，例如：16MHz, 50Hz';
    }

    return errors;
  };

  const handleSave = async () => {
    const errors = validateForm();

    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_ERRORS', payload: errors });
      Alert.alert('错误', '请检查表单填写是否正确');
      return;
    }

    setIsLoading(true);
    try {
      const deviceData = {
        ...state,
        id: state.id || Date.now(),
      };

      let savedDevice;
      if (isNew) {
        try {
          savedDevice = await StorageService.addDevice(deviceData);
          Alert.alert('成功', '器件上架成功');
        } catch (error) {
          if (error.message && error.message.includes('冲突')) {
            Alert.alert('错误', error.message);
            return;
          } else {
            throw error;
          }
        }
      } else {
        try {
          savedDevice = await StorageService.updateDevice(deviceData);
          Alert.alert('成功', '器件更新成功');
        } catch (error) {
          if (error.message && error.message.includes('冲突')) {
            Alert.alert('错误', error.message);
            return;
          } else {
            throw error;
          }
        }
      }

      if (onSave) {
        onSave(savedDevice);
      }

      navigation.goBack();
    } catch (error) {
      logError('保存器件失败', error, 'AdminEditScreen.handleSave');
      Alert.alert('错误', '保存器件失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
        <View style={styles.formContainer}>
          <View style={styles.importButtonContainer}>
            <TouchableOpacity
              style={[
                styles.importButton,
                isImporting && styles.importButtonDisabled,
              ]}
              onPress={handleImport}
              disabled={isImporting}
            >
              <Text style={styles.importButtonText}>
                {isImporting ? '导入中...' : '从Excel导入'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.importButton, styles.scanButton]}
              onPress={() => navigation.navigate('ScanScreen')}
            >
              <Text style={styles.importButtonText}>扫码导入</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>基本信息</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>器件编号</Text>
              <TextInput
                style={styles.input}
                value={state.supplierId}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'supplierId', value: text },
                  })
                }
                placeholder="请输入器件编号"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>器件名称 *</Text>
              <TextInput
                style={[styles.input, state.errors.name && styles.inputError]}
                value={state.name}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'name', value: text },
                  })
                }
                placeholder="请输入器件名称"
              />
              {state.errors.name && (
                <Text style={styles.errorText}>{state.errors.name}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>器件架</Text>
              <View style={styles.shelfSelectorSingle}>
                <Text style={styles.shelfOptionTextSelected}>器件架（一）</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>电气参数</Text>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>电阻</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.resistance && styles.inputError,
                  ]}
                  value={state.resistance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'resistance', value: text },
                    })
                  }
                  placeholder="例如：10Ω"
                />
                {state.errors.resistance && (
                  <Text style={styles.errorText}>
                    {state.errors.resistance}
                  </Text>
                )}
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>电压</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.voltage && styles.inputError,
                  ]}
                  value={state.voltage}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'voltage', value: text },
                    })
                  }
                  placeholder="例如：5V"
                />
                {state.errors.voltage && (
                  <Text style={styles.errorText}>{state.errors.voltage}</Text>
                )}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>电容</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.capacitance && styles.inputError,
                  ]}
                  value={state.capacitance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'capacitance', value: text },
                    })
                  }
                  placeholder="例如：10μF"
                />
                {state.errors.capacitance && (
                  <Text style={styles.errorText}>
                    {state.errors.capacitance}
                  </Text>
                )}
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>电感</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.inductance && styles.inputError,
                  ]}
                  value={state.inductance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'inductance', value: text },
                    })
                  }
                  placeholder="例如：10mH"
                />
                {state.errors.inductance && (
                  <Text style={styles.errorText}>
                    {state.errors.inductance}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>电流</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.current && styles.inputError,
                  ]}
                  value={state.current}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'current', value: text },
                    })
                  }
                  placeholder="例如：1A"
                />
                {state.errors.current && (
                  <Text style={styles.errorText}>{state.errors.current}</Text>
                )}
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>功率</Text>
                <TextInput
                  style={[
                    styles.input,
                    state.errors.power && styles.inputError,
                  ]}
                  value={state.power}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'power', value: text },
                    })
                  }
                  placeholder="例如：1W"
                />
                {state.errors.power && (
                  <Text style={styles.errorText}>{state.errors.power}</Text>
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>频率</Text>
              <TextInput
                style={[
                  styles.input,
                  state.errors.frequency && styles.inputError,
                ]}
                value={state.frequency}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'frequency', value: text },
                  })
                }
                placeholder="例如：16MHz"
              />
              {state.errors.frequency && (
                <Text style={styles.errorText}>{state.errors.frequency}</Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>其他信息</Text>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>类别</Text>
                <TextInput
                  style={styles.input}
                  value={state.category}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'category', value: text },
                    })
                  }
                  placeholder="请输入类别"
                />
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>封装</Text>
                <TextInput
                  style={styles.input}
                  value={state.package}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'package', value: text },
                    })
                  }
                  placeholder="请输入封装"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>位置</Text>
              <TouchableOpacity
                style={styles.positionButton}
                onPress={() => {
                  if (!global.deviceConnection) {
                    Alert.alert('提示', '选择位置需要连接蓝牙设备以亮灯提示位置，请先在连接页面连接蓝牙设备');
                    return;
                  }
                  setShowPositionPicker(true);
                }}
              >
                <Text style={styles.positionButtonText}>
                  {state.location ? `位置 ${state.location}` : '点击选择位置'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>备注</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={state.notes}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'notes', value: text },
                  })
                }
                placeholder="请输入备注"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text style={styles.saveButtonText}>
              {isLoading ? '保存中...' : isNew ? '上架器件' : '更新器件'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showPositionPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPositionPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>选择物理位置</Text>
            <ScrollView style={styles.positionGrid}>
              <View style={styles.positionGridInner}>
                {getAllPositions().map((posInfo) => {
                  const isCurrentPosition = state.location === String(posInfo.position);
                  return (
                    <TouchableOpacity
                      key={posInfo.position}
                      style={[
                        styles.positionItem,
                        posInfo.isOccupied ? styles.positionItemOccupied : styles.positionItemEmpty,
                        isCurrentPosition && styles.positionItemCurrent,
                      ]}
                      onPress={async () => {
                        if (posInfo.isOccupied && !isCurrentPosition) return;
                        if (global.deviceConnection && global.deviceConnection.handler) {
                          if (currentLitPosition.current !== null) {
                            await sendLightCommand('lightOff', currentLitPosition.current);
                            await new Promise(resolve => setTimeout(resolve, 300));
                          }
                          await sendLightCommand('lightOn', posInfo.position);
                          currentLitPosition.current = posInfo.position;
                        }
                        dispatch({
                          type: 'SET_FIELD',
                          payload: { field: 'location', value: String(posInfo.position) },
                        });
                        setShowPositionPicker(false);
                      }}
                      activeOpacity={posInfo.isOccupied && !isCurrentPosition ? 1 : 0.7}
                    >
                      <Text
                        style={[
                          styles.positionItemText,
                          posInfo.isOccupied ? styles.positionItemTextOccupied : styles.positionItemTextEmpty,
                          isCurrentPosition && styles.positionItemTextCurrent,
                        ]}
                      >
                        {posInfo.position}
                      </Text>
                      {posInfo.isOccupied && !isCurrentPosition && (
                        <Text style={styles.positionItemDeviceName} numberOfLines={1}>
                          {posInfo.deviceName}
                        </Text>
                      )}
                      {isCurrentPosition && (
                        <Text style={styles.positionItemCurrentLabel} numberOfLines={1}>
                          当前
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                turnOffCurrentLight();
                setShowPositionPicker(false);
              }}
            >
              <Text style={styles.modalCancelButtonText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  importButtonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  formGroup: {
    marginBottom: 16,
  },
  halfWidth: {
    width: '48%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  shelfSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shelfSelectorSingle: {
    backgroundColor: '#4caf50',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4caf50',
    alignItems: 'center',
  },
  shelfOption: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  shelfOptionSelected: {
    backgroundColor: '#4caf50',
    borderColor: '#4caf50',
  },
  shelfOptionText: {
    fontSize: 14,
    color: '#333',
  },
  shelfOptionTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  importButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#ff9800',
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  positionButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  positionButtonText: {
    fontSize: 16,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  positionGrid: {
    maxHeight: 350,
  },
  positionGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  positionItem: {
    width: 56,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 4,
    borderWidth: 1,
  },
  positionItemEmpty: {
    backgroundColor: '#e3f2fd',
    borderColor: '#bbdefb',
  },
  positionItemOccupied: {
    backgroundColor: '#e8f5e9',
    borderColor: '#a5d6a7',
  },
  positionItemCurrent: {
    backgroundColor: '#fff3e0',
    borderColor: '#ffcc80',
    borderWidth: 2,
  },
  positionItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  positionItemTextEmpty: {
    color: '#1976d2',
  },
  positionItemTextOccupied: {
    color: '#2e7d32',
  },
  positionItemTextCurrent: {
    color: '#e65100',
  },
  positionItemDeviceName: {
    fontSize: 8,
    color: '#4caf50',
    marginTop: 1,
  },
  positionItemCurrentLabel: {
    fontSize: 8,
    color: '#ff9800',
    marginTop: 1,
  },
  modalCancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#8E8E93',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AdminEditScreen;