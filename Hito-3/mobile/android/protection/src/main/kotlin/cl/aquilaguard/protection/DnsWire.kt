package cl.aquilaguard.protection

/** DNS framing and question correlation. Record data is forwarded without interpretation. */
object DnsWire {
    private const val HEADER_SIZE = 12
    private const val OPT = 41

    private data class Name(val labels: List<String>, val next: Int)
    private data class Question(val labels: List<String>, val type: Int, val next: Int)

    fun name(packet: ByteArray): String {
        val labels = question(packet).labels
        if (labels.isEmpty()) return "."
        return labels.joinToString(".") { label ->
            buildString {
                for (char in label) {
                    if (char in '!'..'~' && char != '.' && char != '\\') append(char)
                    else append('\\').append(char.code.toString().padStart(3, '0'))
                }
            }
        }
    }

    fun validateReply(query: ByteArray, response: ByteArray): Int {
        require(response.size >= HEADER_SIZE && u16(query, 0) == u16(response, 0)) { "Respuesta DNS no válida." }
        val flags = u16(response, 2)
        val expectedOpcode = u16(query, 2) and 0x7800
        require(flags and 0x8000 != 0 && flags and 0x7800 == expectedOpcode) { "Respuesta DNS no válida." }
        val expected = question(query)
        val actual = question(response)
        require(expected.labels == actual.labels && expected.type == actual.type) { "La respuesta corresponde a otra pregunta." }
        val rcode = flags and 15
        // A TC-marked message can end partway through its records; it is never written by the UDP tunnel.
        if (flags and 0x0200 != 0) return rcode

        val beforeAdditional = u16(response, 6) + u16(response, 8)
        val records = beforeAdditional + u16(response, 10)
        var cursor = actual.next
        var extendedCode: Int? = null
        repeat(records) { index ->
            val owner = readName(response, cursor)
            val header = owner.next
            require(header <= response.size - 10) { "Registro DNS incompleto." }
            val length = u16(response, header + 8)
            cursor = header + 10 + length
            require(cursor <= response.size) { "Registro DNS incompleto." }
            if (u16(response, header) == OPT) {
                require(index >= beforeAdditional && owner.labels.isEmpty() && extendedCode == null) { "Registro EDNS no válido." }
                extendedCode = response[header + 4].toInt() and 255
            }
        }
        require(cursor == response.size) { "La respuesta DNS contiene datos fuera de sus registros." }
        return ((extendedCode ?: 0) shl 4) or rcode
    }

    private fun question(packet: ByteArray): Question {
        require(packet.size in HEADER_SIZE..65535 && u16(packet, 4) == 1) { "Se requiere una sola pregunta DNS." }
        val name = readName(packet, HEADER_SIZE)
        require(name.next <= packet.size - 4 && u16(packet, name.next + 2) == 1) { "Pregunta DNS incompleta o clase no admitida." }
        return Question(name.labels, u16(packet, name.next), name.next + 4)
    }

    private fun readName(packet: ByteArray, start: Int): Name {
        var cursor = start
        var afterPointer: Int? = null
        var wireLength = 1
        val labels = mutableListOf<String>()
        val visited = HashSet<Int>()
        while (true) {
            require(cursor < packet.size && visited.add(cursor) && visited.size <= 255) { "Nombre DNS truncado o cíclico." }
            val size = packet[cursor].toInt() and 255
            if (size and 0xc0 == 0xc0) {
                val pointer = u16(packet, cursor) and 0x3fff
                require(pointer in HEADER_SIZE until cursor) { "Puntero de compresión DNS no válido." }
                if (afterPointer == null) afterPointer = cursor + 2
                cursor = pointer
                continue
            }
            require(size <= 63) { "Etiqueta DNS no válida." }
            cursor++
            if (size == 0) return Name(labels, afterPointer ?: cursor)
            wireLength += size + 1
            require(wireLength <= 255 && cursor + size <= packet.size) { "Nombre DNS no válido." }
            val label = String(packet, cursor, size, Charsets.ISO_8859_1)
            labels += label.map { if (it in 'A'..'Z') it.lowercaseChar() else it }.joinToString("")
            cursor += size
        }
    }

    fun u16(data: ByteArray, offset: Int): Int {
        require(offset >= 0 && offset < data.size - 1)
        return ((data[offset].toInt() and 255) shl 8) or (data[offset + 1].toInt() and 255)
    }
}
