using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;

namespace TVGLPresenter.Components
{
    public partial class LogViewer : ILogger
    {
        [Parameter] public EventCallback<string> OnLogMessage { get; set; }

        private List<LogEntry> logEntries = new();
        private bool autoScroll = true;
        private int maxLogEntries = 1000;
        private ElementReference logContainer;

        void ILogger.Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
        //    throw new NotImplementedException();
        //}
        //public async Task Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        //{
            if (!IsEnabled(logLevel))
                return;

            var logEntry = new LogEntry
            {
                LogLevel = logLevel,
                Message = formatter(state, exception),
                Timestamp = DateTime.Now
            };
            AddLogEntry(logEntry);
            //_onLogReceived?.Invoke(logEntry);
        }

        private async Task AddLogEntry(LogEntry logEntry)
        {
            logEntries.Add(logEntry);

            // Limit the number of log entries to prevent memory issues
            if (logEntries.Count > maxLogEntries)
            {
                logEntries.RemoveRange(0, logEntries.Count - maxLogEntries);
            }

            await InvokeAsync(() =>
            {
                StateHasChanged();
                if (autoScroll)
                {
                    _ = Task.Delay(50).ContinueWith(async _ =>
                    {
                        try
                        {
                            await InvokeAsync(async () =>
                            {
                                await Task.Delay(10);
                                // Scroll to bottom by setting scroll position
                            });
                        }
                        catch
                        {
                            // Ignore errors
                        }
                    });
                }
            });
        }

        private void ClearLogs()
        {
            logEntries.Clear();
            StateHasChanged();
        }

        private void ToggleAutoScroll()
        {
            autoScroll = !autoScroll;
            StateHasChanged();
        }

        private string GetLogLevelClass(LogLevel logLevel)
        {
            return logLevel switch
            {
                LogLevel.Trace => "log-level-trace",
                LogLevel.Debug => "log-level-debug",
                LogLevel.Information => "log-level-information",
                LogLevel.Warning => "log-level-warning",
                LogLevel.Error => "log-level-error",
                LogLevel.Critical => "log-level-critical",
                _ => ""
            };
        }

        public void Dispose()
        {
            // Cleanup if needed
        }

        public bool IsEnabled(LogLevel logLevel) => true;

        public IDisposable? BeginScope<TState>(TState state) 
            where TState : notnull => default!;

    }
}