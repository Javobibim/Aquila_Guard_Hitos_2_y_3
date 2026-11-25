using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class AquilaGuardLauncher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AquilaGuard", "PC");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, "Aquila-Guard-0.6.13.html");
            using (var page = Assembly.GetExecutingAssembly().GetManifestResourceStream("AquilaGuard.Review"))
            using (var file = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read))
            {
                page.CopyTo(file);
            }
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Win32Exception)
        {
            MessageBox.Show(
                "Windows no pudo abrir el revisor local. Comprueba que tengas un navegador predeterminado.",
                "Aquila Guard", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (IOException)
        {
            MessageBox.Show("Windows no pudo preparar el revisor local.", "Aquila Guard",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (UnauthorizedAccessException)
        {
            MessageBox.Show("Windows no permitió preparar el revisor en tu carpeta de usuario.", "Aquila Guard",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
