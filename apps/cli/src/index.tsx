import React, { useState } from "react";
import {
  render,
  Box,
  Text,
  useInput,
  useApp
} from "ink";

const menu = [
  {
    title: "Dashboard",
    description: "System overview"
  },
  {
    title: "Security Audit",
    description: "Security analysis"
  },
  {
    title: "Policy Manager",
    description: "Permissions and capabilities"
  },
  {
    title: "MCP Manager",
    description: "MCP server management"
  },
  {
    title: "Repository Security Scanner",
    description: "Scan Git repositories for security risks"
  },
  {
    title: "Audit Logs",
    description: "Security event history"
  },
  {
    title: "Security Tests",
    description: "Run security tests"
  },
  {
    title: "System Diagnostics",
    description: "Build and typecheck"
  },
  {
    title: "Settings",
    description: "Configuration"
  },
  {
    title: "Exit",
    description: "Exit console"
  }
];

function App() {
  const [selected, setSelected] = useState(0);
  const [screen, setScreen] = useState<string | null>(null);
  const { exit } = useApp();

  useInput((input, key) => {
    if (screen !== null) {
      if (key.escape || input === "q") {
        setScreen(null);
      }
      return;
    }

    if (key.upArrow) {
      setSelected(current =>
        (current - 1 + menu.length) % menu.length
      );
    }

    if (key.downArrow) {
      setSelected(current =>
        (current + 1) % menu.length
      );
    }

    if (key.return) {
      if (menu[selected].title === "Exit") {
        exit();
      } else {
        setScreen(menu[selected].title);
      }
    }

    if (input === "q") {
      exit();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      padding={1}
      width={90}
    >
      <Box justifyContent="space-between">
        <Text bold color="green">
          🛡 NIMOGUARD
        </Text>

        <Text color="green">
          SECURITY CONSOLE
        </Text>
      </Box>

      <Text color="gray">
        AI AGENT SECURITY GATEWAY
      </Text>

      <Box marginY={1}>
        <Text color="cyan">
          {screen ? `MODULE / ${screen}` : "MAIN MENU"}
        </Text>
      </Box>

      {screen === null ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          padding={1}
          gap={1}
        >
          {menu.map((item, index) => (
            <Box key={item.title} gap={2}>
              <Text
                color={selected === index ? "green" : "gray"}
              >
                {selected === index ? "❯" : " "}
              </Text>

              <Box width={32}>
                <Text
                  color={selected === index ? "green" : "white"}
                  bold={selected === index}
                >
                  {item.title}
                </Text>
              </Box>

              <Text color="gray">
                {item.description}
              </Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          borderStyle="single"
          borderColor="green"
          padding={2}
          flexDirection="column"
          gap={1}
        >
          <Text bold color="green">
            {screen}
          </Text>

          {screen === "Repository Security Scanner" ? (
            <>
              <Text color="cyan">
                Repository Security Analysis
              </Text>

              <Text color="white">
                Scan repositories before running their code.
              </Text>

              <Text color="yellow">
                Planned capabilities:
              </Text>

              <Text color="gray">
                • Secret and API key detection
              </Text>

              <Text color="gray">
                • Malware indicators analysis
              </Text>

              <Text color="gray">
                • Dependency vulnerability checks
              </Text>

              <Text color="gray">
                • NPM and PNPM script analysis
              </Text>

              <Text color="gray">
                • Git hooks and configuration analysis
              </Text>

              <Text color="gray">
                • Security risk assessment
              </Text>

              <Text color="yellow">
                Scanner implementation is planned.
              </Text>
            </>
          ) : (
            <Text color="yellow">
              Module is ready for implementation.
            </Text>
          )}

          <Text color="gray">
            Press ESC to return to the main menu.
          </Text>
        </Box>
      )}

      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">
          ↑ ↓ Navigate | ENTER Select | ESC Back
        </Text>

        <Text color="gray">
          Q Exit
        </Text>
      </Box>

      <Text color="green">
        NimoGuard v0.1.0 | Linux Mint
      </Text>
    </Box>
  );
}

render(<App />);