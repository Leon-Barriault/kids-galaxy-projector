package com.kidsgalaxy.connection

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager

/**
 * Discovers Kids Galaxy servers advertised through DNS-SD / mDNS.
 *
 * Resolution is deliberately serialized. Older Android NSD implementations
 * only reliably handle one active resolve operation at a time; queuing found
 * services makes a classroom with several projectors deterministic instead of
 * losing whichever announcements happened to arrive together.
 */
@Suppress("DEPRECATION")
class AndroidGalaxyDiscovery(
    context: Context,
    private val fallbackScheme: String = "http",
) {
    interface Listener {
        fun onTargetsChanged(targets: List<GalaxyTarget>)

        fun onError(message: String)
    }

    private val appContext = context.applicationContext
    private val nsdManager = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifiManager =
        appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    private val pending = ArrayDeque<NsdServiceInfo>()
    private val targetsByServiceName = linkedMapOf<String, GalaxyTarget>()
    private var resolving = false
    private var started = false
    private var listener: Listener? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    private val discoveryListener =
        object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (!serviceInfo.serviceType.startsWith(SERVICE_TYPE.removeSuffix("."))) return
                pending.addLast(serviceInfo)
                resolveNext()
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                if (targetsByServiceName.remove(serviceInfo.serviceName) != null) {
                    publishTargets()
                }
            }

            override fun onDiscoveryStopped(serviceType: String) = Unit

            override fun onStartDiscoveryFailed(
                serviceType: String,
                errorCode: Int,
            ) {
                started = false
                releaseMulticastLock()
                listener?.onError("Could not search for galaxies (error $errorCode)")
            }

            override fun onStopDiscoveryFailed(
                serviceType: String,
                errorCode: Int,
            ) {
                listener?.onError("Could not stop galaxy search (error $errorCode)")
            }
        }

    fun start(listener: Listener) {
        if (started) return
        this.listener = listener
        acquireMulticastLock()
        started = true
        try {
            nsdManager.discoverServices(
                SERVICE_TYPE,
                NsdManager.PROTOCOL_DNS_SD,
                discoveryListener,
            )
        } catch (error: RuntimeException) {
            started = false
            releaseMulticastLock()
            listener.onError(error.message ?: "Could not search for galaxies")
        }
    }

    fun stop() {
        if (!started) return
        started = false
        try {
            nsdManager.stopServiceDiscovery(discoveryListener)
        } catch (_error: IllegalArgumentException) {
            // Android can race a failed start against stop during Activity teardown.
        } finally {
            pending.clear()
            resolving = false
            releaseMulticastLock()
        }
    }

    private fun resolveNext() {
        if (resolving) return
        val service = pending.removeFirstOrNull() ?: return
        resolving = true
        nsdManager.resolveService(
            service,
            object : NsdManager.ResolveListener {
                override fun onResolveFailed(
                    serviceInfo: NsdServiceInfo,
                    errorCode: Int,
                ) {
                    resolving = false
                    resolveNext()
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    resolving = false
                    targetFrom(serviceInfo)?.let { target ->
                        targetsByServiceName[serviceInfo.serviceName] = target
                        publishTargets()
                    }
                    resolveNext()
                }
            },
        )
    }

    private fun targetFrom(serviceInfo: NsdServiceInfo): GalaxyTarget? {
        if (attribute(serviceInfo, "service") != SERVICE_MARKER) return null
        val host = serviceInfo.host?.hostAddress ?: return null
        val name = attribute(serviceInfo, "name") ?: serviceInfo.serviceName
        val scheme = attribute(serviceInfo, "scheme") ?: fallbackScheme
        return try {
            GalaxyTarget.fromEndpoint(name, scheme, host, serviceInfo.port)
        } catch (_error: IllegalArgumentException) {
            null
        }
    }

    private fun attribute(
        serviceInfo: NsdServiceInfo,
        key: String,
    ): String? =
        serviceInfo.attributes[key]
            ?.toString(Charsets.UTF_8)
            ?.trim()
            ?.takeIf { it.isNotBlank() }

    private fun publishTargets() {
        listener?.onTargetsChanged(
            targetsByServiceName.values.sortedBy { it.name.lowercase() },
        )
    }

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        multicastLock =
            wifiManager
                ?.createMulticastLock("KidsGalaxyDiscovery")
                ?.apply {
                    setReferenceCounted(false)
                    acquire()
                }
    }

    private fun releaseMulticastLock() {
        multicastLock?.let { lock ->
            if (lock.isHeld) lock.release()
        }
        multicastLock = null
    }

    companion object {
        const val SERVICE_TYPE = "_kidsgalaxy._tcp."
        const val SERVICE_MARKER = "kids-galaxy-projector"
    }
}
