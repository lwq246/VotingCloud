import { getPerformance, trace } from "firebase/performance";
import type { PerformanceTrace } from '@firebase/performance-types';

// Initialize Firebase Performance
const perf = getPerformance();

// Track page load performance
export const trackPageLoad = (pageName: string): PerformanceTrace => {
  const pageTrace = trace(perf, `page_load_${pageName}`);
  pageTrace.start();
  console.log(`Started tracking page load for: ${pageName}`);
  return pageTrace;
};

// Track API call performance
export const trackApiCall = (endpoint: string, method: string = 'GET'): PerformanceTrace => {
  const apiTrace = trace(perf, `api_call_${method}_${endpoint}`);
  apiTrace.start();
  console.log(`Started tracking API call: ${method} ${endpoint}`);
  return apiTrace;
};

// Track component render performance
export const trackComponentRender = (componentName: string): PerformanceTrace => {
  const componentTrace = trace(perf, `component_render_${componentName}`);
  componentTrace.start();
  console.log(`Started tracking component render: ${componentName}`);
  return componentTrace;
};

// Track user interaction performance
export const trackUserInteraction = (actionName: string): PerformanceTrace => {
  const interactionTrace = trace(perf, `user_interaction_${actionName}`);
  interactionTrace.start();
  console.log(`Started tracking user interaction: ${actionName}`);
  return interactionTrace;
};

// Helper function to verify performance monitoring is working
export const verifyPerformanceMonitoring = (): boolean => {
  try {
    const testTrace = trace(perf, 'test_trace');
    testTrace.start();
    testTrace.putAttribute('test', 'true');
    testTrace.putMetric('test_metric', 100);
    testTrace.stop();
    console.log('✅ Firebase Performance Monitoring is working correctly');
    return true;
  } catch (error) {
    console.error('❌ Firebase Performance Monitoring error:', error);
    return false;
  }
};

export default {
  trackPageLoad,
  trackApiCall,
  trackComponentRender,
  trackUserInteraction,
  verifyPerformanceMonitoring
};