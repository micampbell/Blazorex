using Microsoft.Extensions.Logging;

namespace TVGLPresenter.Components
{
    public class LogEntry
        {
            public LogLevel LogLevel { get; set; }
            public string Message { get; set; } = string.Empty;
            public DateTime Timestamp { get; set; }
        }
}