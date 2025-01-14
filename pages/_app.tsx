// Next.js custom App component

import type { AppProps } from "next/app";
import { Provider } from "react-redux";
import store from "../store";
import "../styles/globals.css";
import "../styles/theme.css";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;
