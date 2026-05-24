// Mute Expo + react-native-web dev-mode console noise on web. Must import
// before App so the patch is in place before React/AppRegistry start logging.
import './src/lib/silenceWebNoise';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);
