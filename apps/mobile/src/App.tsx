import { IonApp, setupIonicReact } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route, Switch } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { useAuthStore } from './store/auth'
import { TabLayout } from './components/TabLayout'

setupIonicReact()

const PrivateRoute: React.FC<{ path: string; component: React.ComponentType; exact?: boolean }> = ({
  component: Component,
  ...rest
}) => {
  const token = useAuthStore((s) => s.token)
  return (
    <Route
      {...rest}
      render={() => (token ? <Component /> : <Redirect to="/login" />)}
    />
  )
}

const App: React.FC = () => {
  return (
    <IonApp>
      <IonReactRouter>
        <Switch>
          <Route path="/login" component={LoginPage} exact />
          <Route path="/register" component={RegisterPage} exact />
          <PrivateRoute path="/tabs" component={TabLayout} />
          <Route exact path="/">
            <Redirect to="/tabs/dashboard" />
          </Route>
        </Switch>
      </IonReactRouter>
    </IonApp>
  )
}

export default App
