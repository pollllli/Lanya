/**
 * 应用导航配置
 * 负责管理应用的所有导航路由和登录状态
 */
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from '../screens/LoginScreen';
import DeviceListScreen from '../screens/DeviceListScreen';
import DeviceDetailScreen from '../screens/DeviceDetailScreen';
import AdminEditScreen from '../screens/AdminEditScreen';
import BOMScreen from '../screens/BOMScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ConnectionScreen from '../screens/ConnectionScreen';
import ScanScreen from '../screens/ScanScreen';
import { useUser } from '../context/UserContext';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 主标签导航
const MainTabNavigator = () => {
  const { user } = useUser();
  const isAdmin = user?.isAdmin || false;
  const username = user?.username || 'user';

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#f5f5f5',
          borderTopWidth: 1,
          borderTopColor: '#ddd',
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 14,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DeviceListTab"
        options={{
          title: '库存',
          tabBarTestID: 'tab-inventory',
        }}
      >
        {(props) => <DeviceListScreen {...props} isAdmin={isAdmin} />}
      </Tab.Screen>
      <Tab.Screen
        name="Connection"
        component={ConnectionScreen}
        options={{
          title: '连接',
          tabBarTestID: 'tab-connection',
        }}
      />
      <Tab.Screen
        name="BOM"
        options={{
          title: 'BOM配单',
          tabBarTestID: 'tab-bom',
        }}
      >
        {(props) => <BOMScreen {...props} isAdmin={isAdmin} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          title: '我的',
          tabBarTestID: 'tab-profile',
        }}
      >
        {(props) => (
          <ProfileScreen
            {...props}
            route={{
              ...props.route,
              params: {
                ...props.route.params,
                username,
                isAdmin,
              },
            }}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

/**
 * 应用主导航组件
 * 负责管理应用的登录状态和路由配置
 */
const AppNavigator = () => {
  const { user } = useUser();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#f5f5f5',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: '#e0e0e0',
          },
          headerTintColor: '#333',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
          },
          headerBackTitleVisible: false,
          headerLeftContainerStyle: {
            paddingLeft: 8,
          },
          transitionSpec: {
            open: {
              animation: 'timing',
              config: {
                duration: 300,
              },
            },
            close: {
              animation: 'timing',
              config: {
                duration: 300,
              },
            },
          },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: '登录',
            headerShown: false,
          }}
        />
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {(props) => <MainTabNavigator {...props} />}
        </Stack.Screen>
        <Stack.Screen
          name="DeviceDetail"
          component={DeviceDetailScreen}
          options={{
            title: '器件详情',
            headerBackTitle: '返回',
          }}
        />
        <Stack.Screen
          name="AdminEdit"
          component={AdminEditScreen}
          options={({ route }) => ({
            title: route.params?.isNew ? '上架器件' : '编辑器件',
            headerBackTitle: '返回',
          })}
        />
        <Stack.Screen
          name="ScanScreen"
          component={ScanScreen}
          options={{
            title: '扫码导入',
            headerBackTitle: '返回',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;