import { activeWindow } from 'get-windows';

console.log("🕵️  Buscando ventana activa...");

try {
	const result = await activeWindow();
	
	if (result) {
		console.log("✅ ¡ÉXITO! Ventana detectada:");
		console.log("-----------------------------");
		console.log("App:", result.owner.name);
		console.log("Título:", result.title);
		console.log("Ruta:", result.owner.path);
	} else {
		console.log("⚠️  La librería funcionó, pero no devolvió datos (¿Permisos?).");
	}
} catch (error) {
	console.error("❌ ERROR FATAL:", error);
}