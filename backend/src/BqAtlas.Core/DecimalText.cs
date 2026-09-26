using System.Globalization;
namespace BqAtlas.Core;

/// <summary>Portable decimal text; never accepts exponent, grouping, signs or locale separators.</summary>
public static class DecimalText
{
    public static bool TryParse(string? text, int scale, decimal maximum, out decimal value)
    {
        value = 0;
        if (text is null || text.Length is 0 or > 30 || scale < 0 || scale > 28) return false;
        var dot = text.IndexOf('.');
        var whole = dot < 0 ? text : text[..dot];
        var fraction = dot < 0 ? "" : text[(dot + 1)..];
        if (whole.Length == 0 || whole.Length > 1 && whole[0] == '0' || whole.Any(c => !char.IsAsciiDigit(c))) return false;
        if (dot >= 0 && (fraction.Length == 0 || fraction.Length > scale || fraction.Any(c => !char.IsAsciiDigit(c)))) return false;
        if (decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value) && value <= maximum) return true;
        value = 0;
        return false;
    }
    public static string Format(decimal value, int scale) => value.ToString(scale == 0 ? "0" : "0." + new string('#', scale), CultureInfo.InvariantCulture);
    public static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
}
