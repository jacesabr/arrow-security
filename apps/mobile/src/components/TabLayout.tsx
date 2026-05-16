import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/react'
import { Route, Redirect } from 'react-router-dom'
import {
  homeOutline,
  qrCodeOutline,
  walkOutline,
  warningOutline,
  calendarOutline,
} from 'ionicons/icons'
import { DashboardPage } from '../pages/DashboardPage'
import { CheckInPage } from '../pages/CheckInPage'
import { PatrolPage } from '../pages/PatrolPage'
import { IncidentPage } from '../pages/IncidentPage'
import { ShiftsPage } from '../pages/ShiftsPage'

export const TabLayout: React.FC = () => {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route exact path="/tabs/dashboard" component={DashboardPage} />
        <Route exact path="/tabs/checkin" component={CheckInPage} />
        <Route exact path="/tabs/patrol" component={PatrolPage} />
        <Route exact path="/tabs/incidents" component={IncidentPage} />
        <Route exact path="/tabs/shifts" component={ShiftsPage} />
        <Route exact path="/tabs">
          <Redirect to="/tabs/dashboard" />
        </Route>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/tabs/dashboard">
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
        <IonTabButton tab="checkin" href="/tabs/checkin">
          <IonIcon icon={qrCodeOutline} />
          <IonLabel>Check In</IonLabel>
        </IonTabButton>
        <IonTabButton tab="patrol" href="/tabs/patrol">
          <IonIcon icon={walkOutline} />
          <IonLabel>Patrol</IonLabel>
        </IonTabButton>
        <IonTabButton tab="incidents" href="/tabs/incidents">
          <IonIcon icon={warningOutline} />
          <IonLabel>Incidents</IonLabel>
        </IonTabButton>
        <IonTabButton tab="shifts" href="/tabs/shifts">
          <IonIcon icon={calendarOutline} />
          <IonLabel>Shifts</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  )
}
