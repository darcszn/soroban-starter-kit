export { performanceMetricsCollector, type CoreWebVitals, type PerformanceSnapshot } from './metricsCollector';
export { performanceBudgetManager, type PerformanceBudget, type BudgetAlert } from './budgetManager';
export { performanceAnalyzer, type PerformanceRecommendation, type PerformanceAnalysis } from './analyzer';
export { performanceComparator, type PerformanceComparison } from './comparator';
export { bundleAnalyzer, type BundleReport, type ChunkInfo, type SplitOpportunity } from './bundleAnalyzer';
export { imageOptimizer, type ImageOptimizationReport, type ImageRecommendation } from './imageOptimizer';
export { cacheStrategyManager, type CacheRule, type CacheStrategy, type CacheStats } from './cacheStrategyManager';
export { uxCorrelator, type UXCorrelation, type PerformanceInsight, type UXEvent } from './uxCorrelator';
