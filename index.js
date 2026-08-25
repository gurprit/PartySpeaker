/**
 * @format
 */

import React from 'react';
import {AppRegistry, View} from 'react-native';
import App from './App';
import StorageManager from './src/components/common/StorageManager';
import {name as appName} from './app.json';

function PartySpeakerRoot() {
  return (
    <View style={{flex: 1}}>
      <App />
      <StorageManager />
    </View>
  );
}

AppRegistry.registerComponent(appName, () => PartySpeakerRoot);
