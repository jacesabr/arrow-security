import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route, Switch } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CheckInPage } from './pages/CheckInPage'
import { PatrolPage } from './pages/PatrolPage'
import { IncidentPage } from './pages/IncidentPage'
import { IncidentNewPage } from './pages/IncidentNewPage'
import { IncidentDetailPage } from './pages/IncidentDetailPage'
import { ShiftsPage } from './pages/ShiftsPage'
import { ProfilePage } from './pages/ProfilePage'
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
          <PrivateRoute path="/tabs/incidents/new" component={IncidentNewPage} />
          <PrivateRoute path="/tabs/incidents/:id" component={IncidentDetailPage} />
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
