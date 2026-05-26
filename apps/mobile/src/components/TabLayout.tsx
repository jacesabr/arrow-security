import React from 'react'
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
  cameraOutline,
  walkOutline,
  personOutline,
  mapOutline,
  calendarOutline,
} from 'ionicons/icons'
import { DashboardPage } from '../pages/DashboardPage'
import { CheckInPage } from '../pages/CheckInPage'
import { PatrolPage } from '../pages/PatrolPage'
import { ShiftsPage } from '../pages/ShiftsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { GuidePage } from '../pages/GuidePage'
import { useAuthStore } from '../store/auth'

// Cast react-router-dom v5 components to work around @types/react 18 incompatibility
const R = Route as React.ComponentType<any>
const Redir = Redirect as React.ComponentType<any>

const LAYOUT_SHELL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}
const LAYOUT_BODY: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  minHeight: 0,
}

export const TabLayout: React.FC = () => {
  const { user } = useAuthStore()
  const role = user?.role
  const isSupervisor = role === 'supervisor'
  const isAdmin = role === 'tenant_admin' || role === 'platform_admin'
  const tabBarStyle = { '--background': '#ffffff', '--border': '1px solid #e8e5e0' } as any

  if (isAdmin) {
    return (
      <div style={LAYOUT_SHELL}>
        <div style={LAYOUT_BODY}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={DashboardPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/guide" component={GuidePage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="shifts" href="/tabs/shifts">
                <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </div>
    )
  }

  if (isSupervisor) {
    return (
      <div style={LAYOUT_SHELL}>
        <div style={LAYOUT_BODY}>
          <IonTabs>
            <IonRouterOutlet>
              <R exact path="/tabs/dashboard" component={DashboardPage} />
              <R exact path="/tabs/checkin" component={CheckInPage} />
              <R exact path="/tabs/patrol" component={PatrolPage} />
              <R exact path="/tabs/shifts" component={ShiftsPage} />
              <R exact path="/tabs/guide" component={GuidePage} />
              <R exact path="/tabs/profile" component={ProfilePage} />
              <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={tabBarStyle}>
              <IonTabButton tab="dashboard" href="/tabs/dashboard">
                <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
              </IonTabButton>
              <IonTabButton tab="checkin" href="/tabs/checkin">
                <IonIcon icon={cameraOutline} /><IonLabel>Check In</IonLabel>
              </IonTabButton>
              <IonTabButton tab="shifts" href="/tabs/shifts">
                <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
              </IonTabButton>
              <IonTabButton tab="profile" href="/tabs/profile">
                <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
              </IonTabButton>
            </IonTabBar>
          </IonTabs>
        </div>
      </div>
    )
  }

  // Guard view (default)
  return (
    <div style={LAYOUT_SHELL}>
      <div style={LAYOUT_BODY}>
        <IonTabs>
          <IonRouterOutlet>
            <R exact path="/tabs/dashboard" component={DashboardPage} />
            <R exact path="/tabs/checkin" component={CheckInPage} />
            <R exact path="/tabs/patrol" component={PatrolPage} />
            <R exact path="/tabs/shifts" component={ShiftsPage} />
            <R exact path="/tabs/guide" component={GuidePage} />
            <R exact path="/tabs/profile" component={ProfilePage} />
            <R exact path="/tabs"><Redir to="/tabs/dashboard" /></R>
          </IonRouterOutlet>
          <IonTabBar slot="bottom" style={tabBarStyle}>
            <IonTabButton tab="dashboard" href="/tabs/dashboard">
              <IonIcon icon={homeOutline} /><IonLabel>Home</IonLabel>
            </IonTabButton>
            <IonTabButton tab="checkin" href="/tabs/checkin">
              <IonIcon icon={cameraOutline} /><IonLabel>Check In</IonLabel>
            </IonTabButton>
            <IonTabButton tab="patrol" href="/tabs/patrol">
              <IonIcon icon={walkOutline} /><IonLabel>Patrol</IonLabel>
            </IonTabButton>
            <IonTabButton tab="shifts" href="/tabs/shifts">
              <IonIcon icon={calendarOutline} /><IonLabel>Shifts</IonLabel>
            </IonTabButton>
            <IonTabButton tab="profile" href="/tabs/profile">
              <IonIcon icon={personOutline} /><IonLabel>Profile</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </div>
    </div>
  )
}
