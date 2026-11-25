package cl.aquilaguard.protection

internal enum class UnderlayFailure { SWITCHED, LOST, CAPTIVE_PORTAL, NO_DNS, STRICT_DNS }

internal class UnderlayWatch<T>(private val selected: T) {
    fun defaultChanged(network: T, physical: Boolean): UnderlayFailure? =
        UnderlayFailure.SWITCHED.takeIf { physical && network != selected }

    fun lost(network: T): UnderlayFailure? = UnderlayFailure.LOST.takeIf { network == selected }

    fun captivePortal(network: T, loginRequired: Boolean): UnderlayFailure? =
        UnderlayFailure.CAPTIVE_PORTAL.takeIf { network == selected && loginRequired }

    fun dns(network: T, hasResolver: Boolean, customPrivateDns: Boolean): UnderlayFailure? = when {
        network != selected -> null
        customPrivateDns -> UnderlayFailure.STRICT_DNS
        !hasResolver -> UnderlayFailure.NO_DNS
        else -> null
    }
}
