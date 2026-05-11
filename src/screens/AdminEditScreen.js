import React, { useState, useEffect, useReducer } from 'react';
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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';

const AdminEditScreen = ({ navigation, route }) => {
  const { device, isNew, onSave } = route.params || {};

  // 初始状态
  const initialState = {
    id: device?.id || null,
    supplierId: device?.supplierId || '',
    name: device?.name || '',
    function: device?.function || '',
    resistance: device?.resistance || '',
    voltage: device?.voltage || '',
    capacitance: device?.capacitance || '',
    inductance: device?.inductance || '',
    current: device?.current || '',
    power: device?.power || '',
    frequency: device?.frequency || '',
    category: device?.category || '',
    package: device?.package || '',
    manufacturer: device?.manufacturer || '',
    supplier: device?.supplier || '',
    price: device?.price || '',
    quantity: device?.quantity || '',
    location: device?.location || '',
    datasheet: device?.datasheet || '',
    notes: device?.notes || '',
    shelfId: device?.shelfId ? device.shelfId.toString() : '1', // 默认器件架，确保是字符串类型
    errors: {},
  };

  // Reducer函数
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

  // 处理Excel/CSV导入
  const handleImport = async () => {
    try {
      setIsImporting(true);

      // 选择文件
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;

      // 检查文件类型
      if (fileName.endsWith('.csv')) {
        // 处理CSV文件
        try {
          // 读取CSV文件内容
          const fileContent = await FileSystem.readAsStringAsync(fileUri);

          // 使用新的批量导入方法
          const result = await StorageService.importDevicesFromCSV(fileContent);

          if (result.success) {
            let message = `成功导入 ${result.imported} 个器件`;
            if (result.errors && result.errors.length > 0) {
              message += `\n\n有 ${result.errors.length} 个错误:`;
              result.errors.forEach((error) => {
                message += `\n- ${error}`;
              });
            }
            Alert.alert('导入结果', message);
            navigation.goBack();
          } else {
            Alert.alert('错误', '导入失败，请检查文件格式');
          }
        } catch (error) {
          logError('处理CSV文件失败', error, 'AdminEditScreen.handleImport');
          Alert.alert(
            '错误',
            `处理CSV文件失败: ${error.message || '请检查文件格式'}`
          );
        }
      } else {
        // 处理Excel文件
        try {
          // 复制文件到缓存目录
          const cacheDir = FileSystem.cacheDirectory;
          const localUri = cacheDir + fileName;

          await FileSystem.copyAsync({
            from: fileUri,
            to: localUri,
          });

          // 读取文件内容
          const fileContent = await FileSystem.readAsStringAsync(localUri, {
            encoding: 'base64',
          });

          // 解码base64并解析
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

          // 转换为CSV格式
          const csvContent = XLSX.utils.sheet_to_csv(worksheet);

          // 使用新的批量导入方法
          const result = await StorageService.importDevicesFromCSV(csvContent);

          if (result.success) {
            let message = `成功导入 ${result.imported} 个器件`;
            if (result.errors && result.errors.length > 0) {
              message += `\n\n有 ${result.errors.length} 个错误:`;
              result.errors.forEach((error) => {
                message += `\n- ${error}`;
              });
            }
            Alert.alert('导入结果', message);
            navigation.goBack();
          } else {
            Alert.alert('错误', '导入失败，请检查文件格式');
          }
        } catch (error) {
          logError('处理Excel文件失败', error, 'AdminEditScreen.handleImport');
          Alert.alert(
            '错误',
            `处理Excel文件失败: ${error.message || '请检查文件格式'}`
          );
        }
      }
    } catch (error) {
      logError('导入失败', error, 'AdminEditScreen.handleImport');
      Alert.alert('错误', `导入失败: ${error.message || '请重试'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 验证表单
  const validateForm = () => {
    const errors = {};

    if (!state.name.trim()) {
      errors.name = '请输入器件名称';
    }

    if (!state.function.trim()) {
      errors.function = '请输入功能描述';
    }

    // 验证单位格式
    if (
      state.resistance.trim() &&
      !/^\d+(\.\d+)?[kM]?Ω$/.test(state.resistance.trim())
    ) {
      errors.resistance = '电阻格式不正确，例如：10Ω, 1kΩ';
    }

    if (
      state.voltage.trim() &&
      !/^\d+(\.\d+)?[kM]?V$/.test(state.voltage.trim())
    ) {
      errors.voltage = '电压格式不正确，例如：5V, 12V';
    }

    if (
      state.capacitance.trim() &&
      !/^\d+(\.\d+)?[pµnm]?F$/.test(state.capacitance.trim())
    ) {
      errors.capacitance = '电容格式不正确，例如：10μF, 1nF';
    }

    if (
      state.inductance.trim() &&
      !/^\d+(\.\d+)?[nµm]?H$/.test(state.inductance.trim())
    ) {
      errors.inductance = '电感格式不正确，例如：10mH, 1μH';
    }

    if (
      state.current.trim() &&
      !/^\d+(\.\d+)?[mµ]?[Aa]$/.test(state.current.trim())
    ) {
      errors.current = '电流格式不正确，例如：1A, 500mA';
    }

    if (
      state.power.trim() &&
      !/^\d+(\.\d+)?[mkW]?[Ww]$/.test(state.power.trim())
    ) {
      errors.power = '功率格式不正确，例如：1W, 500mW';
    }

    if (
      state.frequency.trim() &&
      !/^\d+(\.\d+)?[kM]?Hz$/.test(state.frequency.trim())
    ) {
      errors.frequency = '频率格式不正确，例如：16MHz, 50Hz';
    }

    return errors;
  };

  // 处理保存
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
          if (error.message && error.message.includes('器件编号')) {
            Alert.alert('错误', error.message);
            return;
          } else {
            throw error;
          }
        }
      } else {
        savedDevice = await StorageService.updateDevice(deviceData);
        Alert.alert('成功', '器件更新成功');
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
          {/* 导入按钮 */}
          <TouchableOpacity
            style={[
              styles.importButton,
              isImporting && styles.importButtonDisabled,
            ]}
            onPress={handleImport}
            disabled={isImporting}
          >
            <Text style={styles.importButtonText}>
              {isImporting ? '导入中...' : '从Excel/CSV导入'}
            </Text>
          </TouchableOpacity>

          {/* 基本信息 */}
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
              <Text style={styles.label}>功能描述 *</Text>
              <TextInput
                style={[
                  styles.input,
                  state.errors.function && styles.inputError,
                ]}
                value={state.function}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'function', value: text },
                  })
                }
                placeholder="请输入功能描述"
              />
              {state.errors.function && (
                <Text style={styles.errorText}>{state.errors.function}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>器件架</Text>
              <View style={styles.shelfSelector}>
                {['1', '2', '3', '4'].map((shelfId) => (
                  <TouchableOpacity
                    key={shelfId}
                    style={[
                      styles.shelfOption,
                      state.shelfId === shelfId && styles.shelfOptionSelected,
                    ]}
                    onPress={() =>
                      dispatch({
                        type: 'SET_FIELD',
                        payload: { field: 'shelfId', value: shelfId },
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.shelfOptionText,
                        state.shelfId === shelfId &&
                          styles.shelfOptionTextSelected,
                      ]}
                    >
                      器件架 {String.fromCharCode(64 + parseInt(shelfId))}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* 电气参数 */}
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

          {/* 其他信息 */}
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

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>制造商</Text>
                <TextInput
                  style={styles.input}
                  value={state.manufacturer}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'manufacturer', value: text },
                    })
                  }
                  placeholder="请输入制造商"
                />
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>供应商</Text>
                <TextInput
                  style={styles.input}
                  value={state.supplier}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'supplier', value: text },
                    })
                  }
                  placeholder="请输入供应商"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>价格</Text>
                <TextInput
                  style={styles.input}
                  value={state.price}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_FIELD',
                      payload: { field: 'price', value: text },
                    })
                  }
                  placeholder="请输入价格"
                />
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
              <Text style={styles.label}>数量</Text>
              <TextInput
                style={styles.input}
                value={state.quantity}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'quantity', value: text },
                  })
                }
                placeholder="请输入数量"
              />
            </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>位置</Text>
              <TextInput
                style={styles.input}
                value={state.location}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'location', value: text },
                  })
                }
                placeholder="请输入位置"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}> datasheet</Text>
              <TextInput
                style={styles.input}
                value={state.datasheet}
                onChangeText={(text) =>
                  dispatch({
                    type: 'SET_FIELD',
                    payload: { field: 'datasheet', value: text },
                  })
                }
                placeholder="请输入 datasheet 链接"
              />
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

          {/* 保存按钮 */}
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
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AdminEditScreen;
