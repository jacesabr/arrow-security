#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor needs an Objective-C macro to register the plugin and surface its methods.
CAP_PLUGIN(ActivityRecognitionPlugin, "ActivityRecognition",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrent, CAPPluginReturnPromise);
)
