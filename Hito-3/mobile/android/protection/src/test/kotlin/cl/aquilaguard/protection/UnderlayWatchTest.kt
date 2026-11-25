package cl.aquilaguard.protection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UnderlayWatchTest {
    private val watch = UnderlayWatch("wifi")

    @Test fun virtualDefaultAndDnsRefreshKeepTheTunnelOpen() {
        assertNull(watch.defaultChanged("vpn", physical = false))
        assertNull(watch.defaultChanged("wifi", physical = true))
        assertNull(watch.dns("wifi", hasResolver = true, customPrivateDns = false))
        assertNull(watch.dns("mobile", hasResolver = false, customPrivateDns = true))
        assertNull(watch.captivePortal("wifi", loginRequired = false))
        assertNull(watch.captivePortal("mobile", loginRequired = true))
    }

    @Test fun shutsDownForRealLossOrUnsupportedDnsPolicy() {
        assertEquals(UnderlayFailure.SWITCHED, watch.defaultChanged("mobile", physical = true))
        assertEquals(UnderlayFailure.LOST, watch.lost("wifi"))
        assertEquals(UnderlayFailure.CAPTIVE_PORTAL, watch.captivePortal("wifi", loginRequired = true))
        assertEquals(UnderlayFailure.NO_DNS, watch.dns("wifi", hasResolver = false, customPrivateDns = false))
        assertEquals(UnderlayFailure.STRICT_DNS, watch.dns("wifi", hasResolver = true, customPrivateDns = true))
        assertNull(watch.lost("mobile"))
    }
}
