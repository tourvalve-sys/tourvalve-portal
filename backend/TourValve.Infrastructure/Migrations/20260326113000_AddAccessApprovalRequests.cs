using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    public partial class AddAccessApprovalRequests : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CountryOfOrigin",
                table: "Agents",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                table: "Agents",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "PasswordResetApprovalRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    AdminContactEmail = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ProcessedByEmail = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PasswordResetApprovalRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RegistrationApprovalRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    CountryOfOrigin = table.Column<string>(type: "text", nullable: false),
                    PhoneNumber = table.Column<string>(type: "text", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    AdminContactEmail = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ProcessedByEmail = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegistrationApprovalRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PasswordResetApprovalRequests_Email_Status",
                table: "PasswordResetApprovalRequests",
                columns: new[] { "Email", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_RegistrationApprovalRequests_Email_Status",
                table: "RegistrationApprovalRequests",
                columns: new[] { "Email", "Status" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PasswordResetApprovalRequests");

            migrationBuilder.DropTable(
                name: "RegistrationApprovalRequests");

            migrationBuilder.DropColumn(
                name: "CountryOfOrigin",
                table: "Agents");

            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                table: "Agents");
        }
    }
}
